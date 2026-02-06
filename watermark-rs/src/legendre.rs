//! Legendre sequence generation for watermarking.
//!
//! Legendre sequences have ideal autocorrelation properties, making them
//! excellent for watermarking - they produce a sharp peak when correlated
//! with themselves, but flat response otherwise.

/// Generate a p×p Legendre array for watermark sequence k.
///
/// The Legendre symbol (a/p) is:
/// - 0 if a ≡ 0 (mod p)
/// - 1 if a is a quadratic residue mod p
/// - -1 otherwise
///
/// We use k to shift the sequence, creating different watermark patterns.
pub fn generate_array(p: usize, k: usize) -> Vec<f64> {
    let mut array = vec![0.0; p * p];

    for y in 0..p {
        for x in 0..p {
            // Compute index with shift k
            let val = (y * p + x + k) % (p * p);
            let symbol = legendre_symbol(val, p);
            array[y * p + x] = symbol as f64;
        }
    }

    array
}

/// Compute the Legendre symbol (a/p) using Euler's criterion.
fn legendre_symbol(a: usize, p: usize) -> i32 {
    if p == 2 {
        return 1;
    }

    let a = a % p;
    if a == 0 {
        return 0;
    }

    // Euler's criterion: a^((p-1)/2) ≡ (a/p) (mod p)
    let exp = (p - 1) / 2;
    let result = mod_pow(a, exp, p);

    if result == 1 {
        1
    } else if result == p - 1 {
        -1
    } else {
        0
    }
}

/// Modular exponentiation: base^exp mod modulus
fn mod_pow(mut base: usize, mut exp: usize, modulus: usize) -> usize {
    if modulus == 1 {
        return 0;
    }
    let mut result = 1;
    base %= modulus;
    while exp > 0 {
        if exp % 2 == 1 {
            result = (result * base) % modulus;
        }
        exp /= 2;
        base = (base * base) % modulus;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_legendre_symbol() {
        // For p=7: quadratic residues are 1, 2, 4
        assert_eq!(legendre_symbol(0, 7), 0);
        assert_eq!(legendre_symbol(1, 7), 1);  // 1 = 1²
        assert_eq!(legendre_symbol(2, 7), 1);  // 2 = 3² mod 7
        assert_eq!(legendre_symbol(3, 7), -1);
        assert_eq!(legendre_symbol(4, 7), 1);  // 4 = 2²
        assert_eq!(legendre_symbol(5, 7), -1);
        assert_eq!(legendre_symbol(6, 7), -1);
    }

    #[test]
    fn test_generate_array() {
        let arr = generate_array(5, 1);
        assert_eq!(arr.len(), 25);
        // Values should be -1, 0, or 1
        for &v in &arr {
            assert!(v == -1.0 || v == 0.0 || v == 1.0);
        }
    }
}
