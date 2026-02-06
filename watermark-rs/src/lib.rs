//! Blind watermark detection library.
//!
//! This is a Rust port of the C++ WatermarkDetection implementation.
//! It detects watermarks embedded in the frequency domain using Legendre sequences.

mod legendre;
mod dft;
mod correlation;
mod detection;

pub use legendre::generate_array;
pub use dft::extract_mark;
pub use correlation::Correlator2D;
pub use detection::{detect_blind, peak_to_rms, DetectionResult};

/// Find the largest prime p such that p <= min(width, height)
pub fn largest_prime_for(width: usize, height: usize) -> usize {
    let max_size = width.min(height);
    for n in (2..=max_size).rev() {
        if is_prime(n) {
            return n;
        }
    }
    2
}

fn is_prime(n: usize) -> bool {
    if n < 2 { return false; }
    if n == 2 { return true; }
    if n % 2 == 0 { return false; }
    let sqrt = (n as f64).sqrt() as usize;
    for i in (3..=sqrt).step_by(2) {
        if n % i == 0 { return false; }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_largest_prime() {
        assert_eq!(largest_prime_for(100, 100), 97);
        assert_eq!(largest_prime_for(800, 600), 599);
        assert_eq!(largest_prime_for(1920, 1080), 1069);
    }
}
