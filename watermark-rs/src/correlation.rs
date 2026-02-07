//! Fast cross-correlation using FFT.
//!
//! Cross-correlation finds where two signals align best.
//! Using FFT: corr(a,b) = IFFT(FFT(a) * conj(FFT(b)))

use num_complex::Complex64;
use rustfft::{FftPlanner, Fft};
use std::sync::Arc;

/// 2D correlator with cached FFT plans.
pub struct Correlator2D {
    width: usize,
    height: usize,
    fft_forward: Arc<dyn Fft<f64>>,
    fft_inverse: Arc<dyn Fft<f64>>,
}

impl Correlator2D {
    pub fn new(width: usize, height: usize) -> Self {
        let mut planner = FftPlanner::new();
        let size = width * height;
        Self {
            width,
            height,
            fft_forward: planner.plan_fft_forward(size),
            fft_inverse: planner.plan_fft_inverse(size),
        }
    }

    /// Compute normalized cross-correlation between two 2D arrays.
    ///
    /// Returns the correlation surface where peaks indicate alignment.
    pub fn correlate(&self, a: &[f64], b: &[f64]) -> Vec<f64> {
        let size = self.width * self.height;
        assert_eq!(a.len(), size);
        assert_eq!(b.len(), size);

        // Convert to complex
        let mut fa: Vec<Complex64> = a.iter().map(|&x| Complex64::new(x, 0.0)).collect();
        let mut fb: Vec<Complex64> = b.iter().map(|&x| Complex64::new(x, 0.0)).collect();

        // Forward FFT
        self.fft_forward.process(&mut fa);
        self.fft_forward.process(&mut fb);

        // Multiply: FFT(a) * conj(FFT(b))
        let mut product: Vec<Complex64> = fa.iter()
            .zip(fb.iter())
            .map(|(a, b)| a * b.conj())
            .collect();

        // Inverse FFT
        self.fft_inverse.process(&mut product);

        // Normalize and return magnitudes
        let scale = 1.0 / size as f64;
        product.iter().map(|c| c.re * scale).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_autocorrelation_peak() {
        let correlator = Correlator2D::new(4, 4);

        // Create a simple pattern
        let mut a = vec![0.0; 16];
        a[0] = 1.0;
        a[5] = 1.0;
        a[10] = 1.0;

        // Autocorrelation should peak at (0,0)
        let result = correlator.correlate(&a, &a);

        // Find max
        let max_idx = result.iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap().0;

        assert_eq!(max_idx, 0, "Autocorrelation should peak at index 0");
    }

    #[test]
    fn test_shifted_correlation() {
        let correlator = Correlator2D::new(8, 8);
        let size = 64;

        // Create pattern at origin
        let mut a = vec![0.0; size];
        a[0] = 1.0;

        // Create same pattern shifted by (2, 3)
        let mut b = vec![0.0; size];
        let shift_y = 2;
        let shift_x = 3;
        let shift_linear = shift_y * 8 + shift_x;
        b[shift_linear] = 1.0;

        let result = correlator.correlate(&a, &b);

        // FFT correlation formula: IFFT(FFT(a) * conj(FFT(b)))
        // For a peak at position k in b, correlation peaks at (size - k)
        let expected_idx = size - shift_linear;
        let max_idx = result.iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap().0;

        assert_eq!(max_idx, expected_idx);
    }
}
