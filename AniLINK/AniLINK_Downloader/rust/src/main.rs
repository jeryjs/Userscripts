use std::io::{self, Write};

mod v1;
mod v2;


fn main() {
    println!("AniLINK Downloader");
    println!("==================");
    println!("Select a version to run:");
    println!("  1) Version 1");
    println!("  2) Version 2");
    print!("Enter your choice (1 or 2): ");
    io::stdout().flush().expect("Failed to flush stdout");

    let mut input = String::new();
    if let Err(e) = io::stdin().read_line(&mut input) {
        eprintln!("Error reading input: {}", e);
        return;
    }

    match input.trim() {
        "1" => {
            println!("Running Version 1...");
            v1::run();
        }
        "2" => {
            println!("Running Version 2...");
            if let Err(e) = v2::run() {
                eprintln!("Error running Version 2: {}", e);
            }
        }
        _ => {
            eprintln!("Invalid choice. Please enter '1' or '2'.");
        }
    }
}