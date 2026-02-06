//! Blind watermark detection algorithm.
//!
//! Detects watermarks without access to the original image by:
//! 1. Extracting frequency coefficients from the image
//! 2. Correlating with Legendre sequences
//! 3. Finding peak/RMS ratio above threshold
//! 4. Decoding shift values to ASCII message

use crate::{extract_mark, generate_array, Correlator2D, largest_prime_for};

/// Result of watermark detection.
#[derive(Debug, Clone)]
pub struct DetectionResult {
    pub detected: bool,
    pub message: String,
    pub sequences_decoded: usize,
    pub min_confidence: f64,
    pub shifts: Vec<usize>,
}

/// Detect watermark blindly (without original image).
///
/// # Arguments
/// * `pixels` - Grayscale pixel values in [0, 1]
/// * `width` - Image width
/// * `height` - Image height
/// * `threshold` - Peak/RMS threshold for detection (typically 4-10)
/// * `max_sequences` - Maximum Legendre sequences to try
pub fn detect_blind(
    pixels: &[f64],
    width: usize,
    height: usize,
    threshold: f64,
    max_sequences: usize,
) -> DetectionResult {
    let p = largest_prime_for(width, height);

    // Extract watermark from frequency domain
    let extracted = extract_mark(pixels, height, width, p);

    // Correlate with Legendre sequences
    let correlator = Correlator2D::new(p, p);
    let mut shifts = Vec::new();
    let mut min_confidence = f64::MAX;

    for k in 1..=max_sequences {
        let wm_array = generate_array(p, k);
        let correlation = correlator.correlate(&extracted, &wm_array);

        let (peak_rms, max_idx) = peak_to_rms(&correlation);

        if peak_rms < threshold {
            // Below threshold, stop searching
            break;
        }

        // Convert linear index to shift value
        // FFT correlation returns peak at (size - shift)
        let size = p * p;
        let shift = if max_idx == 0 { 0 } else { size - max_idx };
        shifts.push(shift);
        min_confidence = min_confidence.min(peak_rms);
    }

    if shifts.is_empty() {
        return DetectionResult {
            detected: false,
            message: String::new(),
            sequences_decoded: 0,
            min_confidence: 0.0,
            shifts: vec![],
        };
    }

    // Decode shifts to ASCII
    let p_sq = p * p;
    let message = shifts_to_ascii(&shifts, p_sq);

    DetectionResult {
        detected: true,
        message,
        sequences_decoded: shifts.len(),
        min_confidence,
        shifts,
    }
}

/// Calculate peak-to-RMS ratio for a correlation surface.
///
/// Returns (peak_rms, max_index)
pub fn peak_to_rms(data: &[f64]) -> (f64, usize) {
    if data.is_empty() {
        return (0.0, 0);
    }

    // Find max and its index
    let (max_idx, &max_val) = data.iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
        .unwrap();

    // Calculate RMS (excluding the peak)
    let sum_sq: f64 = data.iter()
        .enumerate()
        .filter(|(i, _)| *i != max_idx)
        .map(|(_, &v)| v * v)
        .sum();

    let rms = (sum_sq / (data.len() - 1) as f64).sqrt();

    let peak_rms = if rms > 1e-10 { max_val / rms } else { 0.0 };

    (peak_rms, max_idx)
}

/// Convert shift values to ASCII string.
///
/// Each character is encoded as a big-endian integer in base p².
/// Multiple shifts encode one integer, which is then split into 7-bit ASCII.
fn shifts_to_ascii(shifts: &[usize], p_sq: usize) -> String {
    if shifts.is_empty() {
        return String::new();
    }

    // Reconstruct the big integer from shifts (base p²)
    let mut value: u128 = 0;
    for &shift in shifts {
        value = value * (p_sq as u128) + (shift as u128);
    }

    // Extract 7-bit ASCII characters
    let mut chars = Vec::new();
    while value > 0 {
        let c = (value & 0x7F) as u8;
        if c >= 32 && c < 127 {
            chars.push(c as char);
        }
        value >>= 7;
    }

    chars.reverse();
    chars.into_iter().collect()
}

/// Convert ASCII string to shift values for encoding.
pub fn ascii_to_shifts(message: &str, p_sq: usize, num_shifts: usize) -> Vec<usize> {
    // Pack characters into a big integer (7 bits each)
    let mut value: u128 = 0;
    for c in message.chars() {
        value = (value << 7) | ((c as u8 & 0x7F) as u128);
    }

    // Convert to base p²
    let mut shifts = Vec::new();
    for _ in 0..num_shifts {
        shifts.push((value % (p_sq as u128)) as usize);
        value /= p_sq as u128;
    }

    shifts.reverse();
    shifts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_peak_to_rms() {
        let data = vec![1.0, 2.0, 10.0, 1.0, 1.0];
        let (ratio, idx) = peak_to_rms(&data);
        assert_eq!(idx, 2);
        assert!(ratio > 5.0); // Peak is 10, RMS of others is ~1.3
    }

    #[test]
    fn test_ascii_roundtrip() {
        let p_sq = 787 * 787;
        let message = "Hello";
        let shifts = ascii_to_shifts(message, p_sq, 3);
        let decoded = shifts_to_ascii(&shifts, p_sq);
        assert_eq!(decoded, message);
    }

    #[test]
    fn test_ascii_roundtrip_longer() {
        let p_sq = 100 * 100;
        let message = "test123";
        let shifts = ascii_to_shifts(message, p_sq, 5);
        let decoded = shifts_to_ascii(&shifts, p_sq);
        assert_eq!(decoded, message);
    }
}
