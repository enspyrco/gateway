//! DFT-based watermark extraction.
//!
//! Watermarks are embedded in the frequency domain of the image.
//! This module extracts the relevant frequency coefficients.

use num_complex::Complex64;
use rustfft::{FftPlanner, Fft};
use std::sync::Arc;

/// Extract the p×p watermark coefficients from an image.
///
/// The watermark is embedded in the low-frequency coefficients of the DFT.
/// We extract a p×p block from the center of the frequency domain.
pub fn extract_mark(
    pixels: &[f64],
    height: usize,
    width: usize,
    p: usize,
) -> Vec<f64> {
    // Compute 2D DFT
    let spectrum = dft_2d(pixels, height, width);

    // Extract p×p coefficients from low frequencies
    let mut mark = vec![0.0; p * p];

    for y in 0..p {
        for x in 0..p {
            // Map to frequency domain indices (centered at DC)
            let fy = if y < p / 2 { y } else { height - (p - y) };
            let fx = if x < p / 2 { x } else { width - (p - x) };

            let idx = fy * width + fx;
            mark[y * p + x] = spectrum[idx].norm();
        }
    }

    mark
}

/// Compute 2D DFT using row-column decomposition.
fn dft_2d(pixels: &[f64], height: usize, width: usize) -> Vec<Complex64> {
    let mut planner = FftPlanner::new();
    let fft_row: Arc<dyn Fft<f64>> = planner.plan_fft_forward(width);
    let fft_col: Arc<dyn Fft<f64>> = planner.plan_fft_forward(height);

    // Convert to complex
    let mut data: Vec<Complex64> = pixels.iter()
        .map(|&p| Complex64::new(p, 0.0))
        .collect();

    // FFT on rows
    for row in 0..height {
        let start = row * width;
        let row_slice = &mut data[start..start + width];
        fft_row.process(row_slice);
    }

    // Transpose
    let mut transposed = vec![Complex64::new(0.0, 0.0); width * height];
    for y in 0..height {
        for x in 0..width {
            transposed[x * height + y] = data[y * width + x];
        }
    }

    // FFT on columns (now rows after transpose)
    for col in 0..width {
        let start = col * height;
        let col_slice = &mut transposed[start..start + height];
        fft_col.process(col_slice);
    }

    // Transpose back
    let mut result = vec![Complex64::new(0.0, 0.0); width * height];
    for y in 0..height {
        for x in 0..width {
            result[y * width + x] = transposed[x * height + y];
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dft_2d_dc() {
        // Constant image should have all energy at DC
        let pixels = vec![1.0; 16];
        let spectrum = dft_2d(&pixels, 4, 4);

        // DC component (top-left) should be sum of all pixels
        assert!((spectrum[0].re - 16.0).abs() < 1e-10);
        assert!(spectrum[0].im.abs() < 1e-10);
    }

    #[test]
    fn test_extract_mark() {
        let pixels = vec![0.5; 64];
        let mark = extract_mark(&pixels, 8, 8, 3);
        assert_eq!(mark.len(), 9);
    }
}
