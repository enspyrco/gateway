//
//  detect_blind3.cpp
//  Blind Watermark Detection v3 — DFT-domain whitening.
//
//  v1 correlated raw marked-image DFT coefficients: image spectrum drowns the
//  mark (peak/RMS ~4 vs ~120-260 non-blind).
//  v2 subtracted a Gaussian-blur estimate of the original in the spatial
//  domain: works on smooth images, fails on textured ones (the residual
//  keeps image high-frequency content).
//
//  v3 whitens the EXTRACTED DFT COEFFICIENTS before correlation. The mark is
//  embedded additively per coefficient (Legendre +/-strength), but the image
//  spectrum spans orders of magnitude — a handful of big low-frequency
//  coefficients dominate the correlation sum. Normalizing each coefficient
//  equalizes the votes: coefficients where the image is quiet carry the mark's
//  sign, the rest contribute zero-mean noise, and with p*p ~ 270k coefficients
//  the Legendre correlation peak stands far above the noise floor.
//
//  Modes:
//    sign   — e := sign(e)                   (1-bit, maximally robust)
//    local  — e := e / (localMean(|e|)+eps)  (soft whitening, keeps amplitude)
//    none   — raw coefficients (v1 behaviour, for comparison)
//
//  Output contract (parsed by gateway backend detect.js — keep stable):
//    Message: "<decoded>"
//    Sequences decoded: <n>
//    Minimum confidence: <x.xx>
//    exit code 0 = detected, 1 = not found
//

#include <opencv2/opencv.hpp>
#include <chrono>
#include <cmath>
#include <cstring>
#include <numeric>
#include <iomanip>

#include "WatermarkDetection.hpp"
#include "Utilities.hpp"

int main(int argc, const char* argv[]) {
  auto totalStart = std::chrono::high_resolution_clock::now();

  // args: marked image path, [threshold], [mode], [local window]
  if (argc < 2 || argc > 5) {
    std::cout << "Usage: detect_blind3 <marked_image_path> [threshold] [sign|local|none] [window]"
              << std::endl;
    return -1;
  }

  std::string markedFilePath = argv[1];

  double threshold = 10.0;
  if (argc >= 3) threshold = atof(argv[2]);

  // local-mean whitening validated across the full live gallery (see README);
  // sign mode is the more aggressive 1-bit fallback.
  std::string mode = "local";
  if (argc >= 4) mode = argv[3];

  int window = 15;
  if (argc == 5) window = atoi(argv[4]);

  std::cout << "========================================" << std::endl;
  std::cout << "   BLIND WATERMARK DETECTION v3" << std::endl;
  std::cout << "========================================" << std::endl;
  std::cout << "Image: " << markedFilePath << std::endl;
  std::cout << "Threshold: " << threshold << ", whitening: " << mode << std::endl;

  cv::Mat marked = cv::imread(markedFilePath, cv::IMREAD_COLOR);
  if (marked.empty()) {
    std::cout << "ERROR: Could not read image: " << markedFilePath << std::endl;
    return -1;
  }

  int imgRows = marked.rows;
  int imgCols = marked.cols;
  int p = largestPrimeFor(marked);
  std::cout << "Image: " << imgCols << "x" << imgRows << ", prime p = " << p << std::endl;

  // Same colorspace as mark.cpp/detect.cpp: HSV, V channel carries the mark.
  cv::Mat hsvMarked;
  cvtColor(marked, hsvMarked, cv::COLOR_BGR2HSV);

  double* lumaArray = new double[imgCols * imgRows];
  for (int y = 0; y < imgRows; y++) {
    for (int x = 0; x < imgCols; x++) {
      lumaArray[y * imgCols + x] = hsvMarked.at<cv::Vec3b>(y, x).val[2] / 255.0;
    }
  }

  auto extractStart = std::chrono::high_resolution_clock::now();
  std::cout << "Extracting frequency coefficients (DFT)..." << std::endl;
  double* extractedMark = new double[p * p];
  extractMark(imgRows, imgCols, p, p, lumaArray, extractedMark);

  // ── Whitening ──────────────────────────────────────────────────────────
  if (mode == "sign") {
    for (int i = 0; i < p * p; i++) {
      extractedMark[i] = (extractedMark[i] > 0) ? 1.0 : ((extractedMark[i] < 0) ? -1.0 : 0.0);
    }
  } else if (mode == "local") {
    // Normalize by a local mean of |coefficient| (box filter, `window` wide).
    cv::Mat absMat(p, p, CV_64F);
    for (int i = 0; i < p * p; i++) absMat.at<double>(i / p, i % p) = std::fabs(extractedMark[i]);
    cv::Mat localMean;
    cv::blur(absMat, localMean, cv::Size(window, window));
    const double eps = 1e-9;
    for (int i = 0; i < p * p; i++) {
      extractedMark[i] /= (localMean.at<double>(i / p, i % p) + eps);
    }
  }  // "none": leave raw

  auto extractEnd = std::chrono::high_resolution_clock::now();
  double timeExtraction =
      std::chrono::duration<double, std::milli>(extractEnd - extractStart).count();

  double* wmArray = new double[p * p];
  double* correlationVals = new double[p * p];

  auto corrStart = std::chrono::high_resolution_clock::now();
  std::cout << "Correlating with Legendre sequences..." << std::endl;
  std::cout << std::setw(6) << "Seq" << std::setw(14) << "Peak/RMS"
            << std::setw(12) << "Status" << std::setw(10) << "Shift" << std::endl;
  std::cout << std::string(42, '-') << std::endl;

  std::vector<int> shifts;
  std::vector<double> confidences;
  int k = 1;
  const int maxK = 100;

  while (k <= maxK) {
    generateArray(p, k, wmArray);
    fastCorrelation(p, p, extractedMark, wmArray, correlationVals);

    double maxVal = 0.0;
    int maxX = -1, maxY = -1;
    for (int y = 0; y < p; y++) {
      for (int x = 0; x < p; x++) {
        if (correlationVals[y * p + x] > maxVal) {
          maxVal = correlationVals[y * p + x];
          maxY = y;
          maxX = x;
        }
      }
    }

    double ms = 0;
    for (int i = 0; i < p * p; i++) {
      ms += (correlationVals[i] * correlationVals[i]) / (p * p);
    }
    double peak2rmsVal = maxVal / sqrt(ms);

    std::cout << std::setw(6) << k << std::setw(14) << std::fixed
              << std::setprecision(2) << peak2rmsVal;

    if (peak2rmsVal > threshold) {
      int shift = maxY * p + maxX;
      std::cout << std::setw(12) << "DETECTED" << std::setw(10) << shift << std::endl;
      shifts.push_back(shift);
      confidences.push_back(peak2rmsVal);
      k++;
    } else {
      std::cout << std::setw(12) << "below" << std::endl;
      break;  // families are embedded consecutively from k=1; first miss = end
    }
  }

  auto corrEnd = std::chrono::high_resolution_clock::now();
  double timeCorrelation =
      std::chrono::duration<double, std::milli>(corrEnd - corrStart).count();

  std::string message = "";
  double minConfidence = 0.0;
  bool detected = false;

  if (shifts.size() > 0) {
    message = getASCII(shifts, p * p);
    detected = true;
    minConfidence = confidences[0];
    for (double c : confidences) {
      if (c < minConfidence) minConfidence = c;
    }
  }

  auto totalEnd = std::chrono::high_resolution_clock::now();
  double timeTotal = std::chrono::duration<double, std::milli>(totalEnd - totalStart).count();

  std::cout << std::endl;
  std::cout << "========================================" << std::endl;
  std::cout << "              RESULTS" << std::endl;
  std::cout << "========================================" << std::endl;
  std::cout << "Watermark detected: " << (detected ? "YES" : "NO") << std::endl;

  if (detected) {
    std::cout << "Message: \"" << message << "\"" << std::endl;
    std::cout << "Message length: " << message.length() << " characters" << std::endl;
    std::cout << "Sequences decoded: " << shifts.size() << std::endl;
    std::cout << "Minimum confidence: " << std::fixed << std::setprecision(2)
              << minConfidence << " (threshold was " << threshold << ")" << std::endl;
  } else {
    std::cout << "No watermark found above threshold " << threshold << std::endl;
  }

  std::cout << std::endl << "Timing:" << std::endl;
  std::cout << "  DFT extract:   " << std::fixed << std::setprecision(0)
            << timeExtraction << " ms" << std::endl;
  std::cout << "  Correlation:   " << timeCorrelation << " ms" << std::endl;
  std::cout << "  Total:         " << timeTotal << " ms" << std::endl;

  delete[] lumaArray;
  delete[] extractedMark;
  delete[] wmArray;
  delete[] correlationVals;

  return detected ? 0 : 1;
}
