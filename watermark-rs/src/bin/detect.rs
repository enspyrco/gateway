//! Blind watermark detection CLI.
//!
//! Usage: detect <image_path> [--threshold <value>] [--max-sequences <value>]

use anyhow::{Context, Result};
use clap::Parser;
use image::GenericImageView;
use std::path::PathBuf;
use std::time::Instant;
use watermark_detection::{detect_blind, largest_prime_for};

#[derive(Parser)]
#[command(name = "detect", about = "Blind watermark detection")]
struct Args {
    /// Path to the image file
    image_path: PathBuf,

    /// Detection threshold (higher = stricter)
    #[arg(short, long, default_value = "4.0")]
    threshold: f64,

    /// Maximum Legendre sequences to try
    #[arg(short, long, default_value = "100")]
    max_sequences: usize,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let total_start = Instant::now();

    println!("========================================");
    println!("     BLIND WATERMARK DETECTION");
    println!("========================================\n");
    println!("Image: {}", args.image_path.display());
    println!("Threshold: {}\n", args.threshold);

    // Load image
    let img = image::open(&args.image_path).context("Failed to open image")?;
    let (width, height) = img.dimensions();
    println!("Image loaded: {}x{}", width, height);

    let p = largest_prime_for(width as usize, height as usize);
    println!("Largest prime: {}", p);
    println!("Watermark coefficients: {} x {} = {}\n", p, p, p * p);

    // Convert to grayscale (using max of RGB as "value")
    let luma: Vec<f64> = img.pixels().map(|(_, _, pixel)| {
        let [r, g, b, _] = pixel.0;
        r.max(g).max(b) as f64 / 255.0
    }).collect();

    println!("Detecting watermark...\n");

    // Run detection
    let result = detect_blind(
        &luma,
        width as usize,
        height as usize,
        args.threshold,
        args.max_sequences,
    );

    println!("========================================");
    println!("              RESULTS");
    println!("========================================\n");

    if result.detected {
        println!("Watermark detected: YES");
        println!("Message: \"{}\"", result.message);
        println!("Sequences decoded: {}", result.sequences_decoded);
        println!("Minimum confidence: {:.2}", result.min_confidence);
    } else {
        println!("Watermark detected: NO");
    }

    println!("\nTiming:");
    println!("  Total: {:.0} ms\n", total_start.elapsed().as_secs_f64() * 1000.0);

    std::process::exit(if result.detected { 0 } else { 1 });
}
