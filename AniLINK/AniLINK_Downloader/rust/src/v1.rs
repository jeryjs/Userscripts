use std::io::{self, Write, BufRead};
use std::path::{Path, PathBuf};
use std::fs;
use std::process::{Command, Stdio, Child};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration as StdDuration;

// For features provided by Python's 'rich', 'requests', 'py7zr', 'configparser', 'regex'
// these would typically be handled by external crates in Rust.
// E.g., dialoguer, indicatif, comfy-table, reqwest, sevenz-rust, config-rs, regex, ctrlc.

#[macro_use]
use lazy_static::lazy_static;

const VERSION: &str = "1.3.1";

#[derive(Debug, Clone)]
struct Settings {
    parallel_downloads: usize,
    retries: u32,
    speed_limit: Option<String>,
    timeout: u64, // seconds
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            parallel_downloads: 4,
            retries: 3,
            speed_limit: None,
            timeout: 30,
        }
    }
}

#[derive(Debug, Clone)]
struct LinkInfo {
    name: String,
    url: String,
    // To store the subprocess handle for cancellation. This would require Child to be shareable and mutable.
    // For simplicity, this example won't directly use this field for cancellation in the signal handler.
    process: Option<Arc<Mutex<Option<Child>>>>,
}

lazy_static! {
    static ref ACTIVE_DOWNLOADS: Mutex<Vec<(usize, LinkInfo)>> = Mutex::new(Vec::new());
}

// Existing functions from the initial v1.rs file
fn parse_duration(line: &str) -> f64 {
    let time_str = line.split("Duration: ").nth(1).unwrap().split(',').next().unwrap().trim();
    let parts: Vec<f64> = time_str.split(':').map(|x| x.parse().unwrap()).collect();
    let (h, m, s) = (parts[0], parts[1], parts[2]);
    h * 3600.0 + m * 60.0 + s
}

fn parse_time(line: &str) -> f64 {
    // Example line: "frame=  293 fps= 28 q=26.0 size=    1024kB time=00:00:10.16 bitrate= 827.2kbits/s speed=0.976x"
    // We need to find "time=" then parse HH:MM:SS.mmm
    if let Some(time_section) = line.split("time=").nth(1) {
        if let Some(time_str) = time_section.split(' ').next() {
             // time_str is like "00:00:10.16"
            let main_parts: Vec<&str> = time_str.split('.').collect();
            let hms_parts: Vec<Result<f64, _>> = main_parts[0].split(':').map(|x| x.parse::<f64>()).collect();

            if hms_parts.len() == 3 && hms_parts.iter().all(Result::is_ok) {
                let h = hms_parts[0].as_ref().unwrap();
                let m = hms_parts[1].as_ref().unwrap();
                let s_val = hms_parts[2].as_ref().unwrap();
                
                let mut total_seconds = h * 3600.0 + m * 60.0 + s_val;

                if main_parts.len() > 1 {
                    if let Ok(millis) = main_parts[1].parse::<f64>() {
                        total_seconds += millis / 100.0; // Assuming .xx is centiseconds
                    }
                }
                return total_seconds;
            }
        }
    }
    0.0 // Return 0 if parsing fails
}


// Replaces the stub from the original v1.rs
fn get_download_folder(default_folder: &str) -> String {
    print!("Enter the name of the folder to save videos in (default: {}): ", default_folder);
    io::stdout().flush().unwrap();
    let mut folder = String::new();
    io::stdin().read_line(&mut folder).unwrap();
    folder = folder.trim().to_string();
    if folder.is_empty() {
        folder = default_folder.to_string();
    }

    if !Path::new(&folder).exists() {
        match fs::create_dir_all(&folder) {
            Ok(_) => println!("Created folder: {}", folder),
            Err(e) => eprintln!("Error creating folder {}: {}", folder, e),
        }
    }
    folder
}

fn get_file_extension(url: &str) -> String {
    if url.contains(".m3u8") {
        ".mp4".to_string()
    } else {
        Path::new(url)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| format!(".{}", s))
            .unwrap_or_else(|| ".mp4".to_string())
    }
}

fn sanitize_path(path: &str) -> String {
    path.trim_matches(|c| c == '"' || c == '\'').to_string()
}

fn sanitize_filename(name: &str) -> String {
    name.chars().map(|c| {
        match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        }
    }).collect()
}

fn get_config_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_else(|_| {
            // Fallback if LOCALAPPDATA is not set
            let home = std::env::var("USERPROFILE").unwrap_or_default();
            PathBuf::from(home).join("AppData").join("Local").into_os_string().into_string().unwrap_or_default()
        })).join("m3u_downloader")
    } else { // macOS, Linux
        PathBuf::from(std::env::var("HOME").unwrap_or_default())
            .join(".config")
            .join("m3u_downloader")
    }
}


fn load_settings() -> Settings {
    let config_dir = get_config_dir();
    let config_file = config_dir.join("settings.ini");
    let mut settings = Settings::default();

    if config_file.exists() {
        // Simplified INI parsing. A crate like `ini` or `config-rs` is recommended.
        if let Ok(file_content) = fs::read_to_string(&config_file) {
            for line in file_content.lines() {
                if line.starts_with('#') || line.trim().is_empty() || !line.contains('=') {
                    continue;
                }
                let parts: Vec<&str> = line.splitn(2, '=').map(|s| s.trim()).collect();
                if parts.len() == 2 {
                    match parts[0] {
                        "parallel_downloads" => settings.parallel_downloads = parts[1].parse().unwrap_or(settings.parallel_downloads),
                        "retries" => settings.retries = parts[1].parse().unwrap_or(settings.retries),
                        "speed_limit" => settings.speed_limit = if parts[1].is_empty() { None } else { Some(parts[1].to_string()) },
                        "timeout" => settings.timeout = parts[1].parse().unwrap_or(settings.timeout),
                        _ => {}
                    }
                }
            }
        } else {
            eprintln!("Warning: Could not read settings file at {}", config_file.display());
        }
    }
    settings
}

fn save_settings(settings: &Settings) {
    let config_dir = get_config_dir();
    if !config_dir.exists() {
        if let Err(e) = fs::create_dir_all(&config_dir) {
            eprintln!("Failed to create config directory {}: {}", config_dir.display(), e);
            return;
        }
    }
    let config_file = config_dir.join("settings.ini");

    let content = format!(
        "[Settings]\nparallel_downloads = {}\nretries = {}\nspeed_limit = {}\ntimeout = {}\n",
        settings.parallel_downloads,
        settings.retries,
        settings.speed_limit.as_deref().unwrap_or(""),
        settings.timeout
    );
    if let Err(e) = fs::write(&config_file, content) {
        eprintln!("Failed to write settings file {}: {}", config_file.display(), e);
    } else {
        println!("Settings saved to {}", config_file.display());
    }
}

fn customize_settings(mut settings: Settings) -> Settings {
    loop {
        println!("\nSettings:");
        println!("1. Parallel Downloads: {}", settings.parallel_downloads);
        println!("2. Retries: {}", settings.retries);
        println!("3. Speed Limit (e.g., 500k, 2M): {}", settings.speed_limit.as_deref().unwrap_or("None"));
        println!("4. Timeout (seconds): {}", settings.timeout);

        print!("Enter the numbers of the settings you want to change (e.g., 1,3), or press Enter to finish: ");
        io::stdout().flush().unwrap();
        let mut choices_str = String::new();
        io::stdin().read_line(&mut choices_str).unwrap();
        let choices_str = choices_str.trim();

        if choices_str.is_empty() {
            break;
        }

        for choice in choices_str.split(',') {
            match choice.trim() {
                "1" => {
                    print!("Enter the number of parallel downloads (default: {}): ", settings.parallel_downloads);
                    io::stdout().flush().unwrap();
                    let mut input = String::new();
                    io::stdin().read_line(&mut input).unwrap();
                    settings.parallel_downloads = input.trim().parse().unwrap_or(settings.parallel_downloads);
                }
                "2" => {
                    print!("Enter the number of retries (default: {}): ", settings.retries);
                    io::stdout().flush().unwrap();
                    let mut input = String::new();
                    io::stdin().read_line(&mut input).unwrap();
                    settings.retries = input.trim().parse().unwrap_or(settings.retries);
                }
                "3" => {
                    print!("Enter the speed limit (e.g., 500k, 2M) (current: {}, press Enter for None): ", settings.speed_limit.as_deref().unwrap_or("None"));
                    io::stdout().flush().unwrap();
                    let mut input = String::new();
                    io::stdin().read_line(&mut input).unwrap();
                    let trimmed_input = input.trim();
                    if trimmed_input.is_empty() {
                        settings.speed_limit = None;
                    } else {
                        settings.speed_limit = Some(trimmed_input.to_string());
                    }
                }
                "4" => {
                    print!("Enter the download timeout in seconds (default: {}): ", settings.timeout);
                    io::stdout().flush().unwrap();
                    let mut input = String::new();
                    io::stdin().read_line(&mut input).unwrap();
                    settings.timeout = input.trim().parse().unwrap_or(settings.timeout);
                }
                _ => println!("Invalid choice: {}", choice),
            }
        }
        print!("Do you want to change more settings? (yes/no, default: no): ");
        io::stdout().flush().unwrap();
        let mut confirm_str = String::new();
        io::stdin().read_line(&mut confirm_str).unwrap();
        if !confirm_str.trim().eq_ignore_ascii_case("yes") {
            break;
        }
    }
    save_settings(&settings);
    settings
}

fn check_ffmpeg() {
    match Command::new("ffmpeg").arg("-version").stdout(Stdio::null()).stderr(Stdio::null()).status() {
        Ok(status) if status.success() => { /* ffmpeg found */ }
        _ => {
            print!("\x1b[31mffmpeg not found.\x1b[0m Download minimal version? (yes/no, default: yes): "); // Red text
            io::stdout().flush().unwrap();
            let mut choice = String::new();
            io::stdin().read_line(&mut choice).unwrap();
            if choice.trim().is_empty() || choice.trim().eq_ignore_ascii_case("yes") {
                download_ffmpeg();
            } else {
                eprintln!("\x1b[31mffmpeg is required.\x1b[0m");
                std::process::exit(1);
            }
        }
    }
}

fn download_ffmpeg() {
    println!("Downloading minimal ffmpeg...");
    println!("Note: Actual download and extraction requires external crates (e.g., reqwest, sevenz-rust). This is a simulation.");

    let ffmpeg_dir = PathBuf::from(".ffmpeg");
    if fs::create_dir_all(&ffmpeg_dir).is_err() {
        eprintln!("Failed to create .ffmpeg directory. Please check permissions.");
        return;
    }
    
    // Simulate download (placeholder)
    // In a real scenario, use `reqwest` to download from "https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.7z"
    let ffmpeg_archive = ffmpeg_dir.join("ffmpeg.7z");
    if fs::write(&ffmpeg_archive, "dummy 7z archive content").is_err() {
         eprintln!("Failed to create dummy ffmpeg archive at {}.", ffmpeg_archive.display());
         return;
    }
    println!("Dummy ffmpeg.7z created at {}", ffmpeg_archive.display());

    // Simulate extraction (placeholder)
    // In a real scenario, use a crate like `sevenz-rust` to extract the archive.
    let ffmpeg_bin_dir = ffmpeg_dir.join("ffmpeg-git-essentials").join("bin");
     if fs::create_dir_all(&ffmpeg_bin_dir).is_err() {
        eprintln!("Failed to create dummy ffmpeg bin directory at {}.", ffmpeg_bin_dir.display());
        return;
    }
    let ffmpeg_exe_name = if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" };
    if fs::write(ffmpeg_bin_dir.join(ffmpeg_exe_name), "dummy ffmpeg executable").is_err() {
        eprintln!("Failed to create dummy ffmpeg executable in {}.", ffmpeg_bin_dir.display());
        return;
    }
    println!("Dummy ffmpeg executable created in {}", ffmpeg_bin_dir.display());

    if let Ok(current_path) = std::env::var("PATH") {
        if let Some(bin_dir_str) = ffmpeg_bin_dir.to_str() {
            let new_path = format!("{}{}{}", bin_dir_str, std::path::MAIN_SEPARATOR, current_path);
            std::env::set_var("PATH", new_path);
            println!("ffmpeg (dummy) added to PATH for this session.");
        } else {
            eprintln!("Could not convert ffmpeg bin directory to string.");
        }
    } else {
        eprintln!("Could not get current PATH to update.");
    }
    println!("ffmpeg (dummy) 'installed'.");
}

fn parse_m3u(file_path: &str) -> Vec<LinkInfo> {
    let mut links = Vec::new();
    match fs::File::open(file_path) {
        Ok(file) => {
            let reader = io::BufReader::new(file);
            let mut lines_iter = reader.lines();
            while let Some(Ok(line)) = lines_iter.next() {
                if line.starts_with("#EXTINF") {
                    let parts: Vec<&str> = line.splitn(2, ',').collect();
                    if parts.len() > 1 {
                        let name = parts[1].trim().to_string();
                        if let Some(Ok(url_line)) = lines_iter.next() {
                            let url = url_line.trim().to_string();
                            if !url.starts_with('#') && !url.is_empty() {
                                links.push(LinkInfo { name, url, process: None });
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("\x1b[31mError parsing M3U file {}: {}\x1b[0m", file_path, e);
        }
    }
    links
}

fn parse_number_ranges(s: &str) -> HashSet<usize> {
    let mut result = HashSet::new();
    for part in s.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if part.contains('-') {
            let range_parts: Vec<&str> = part.splitn(2, '-').collect();
            if range_parts.len() == 2 {
                if let (Ok(a), Ok(b)) = (range_parts[0].parse::<usize>(), range_parts[1].parse::<usize>()) {
                    if a <= b {
                        for i in a..=b { result.insert(i); }
                    } else {
                        eprintln!("Invalid range (start > end): {}-{}", a, b);
                    }
                } else {
                     eprintln!("Invalid number in range: {}", part);
                }
            }
        } else {
            if let Ok(num) = part.parse::<usize>() {
                result.insert(num);
            } else {
                eprintln!("Invalid number: {}", part);
            }
        }
    }
    result
}

fn get_output_file(link_info: &LinkInfo, folder: &str) -> PathBuf {
    let name_without_ext = Path::new(&link_info.name)
        .file_stem()
        .unwrap_or_default()
        .to_str()
        .unwrap_or(&link_info.name); // Fallback to full name if no stem
    let sanitized_name = sanitize_filename(name_without_ext);
    let ext = get_file_extension(&link_info.url);
    PathBuf::from(folder).join(format!("{}{}", sanitized_name, ext))
}

fn check_existing_files(links: Vec<LinkInfo>, folder: &str) -> Vec<LinkInfo> {
    let mut existing_files_info = Vec::new();
    for (idx, link_info) in links.iter().enumerate() {
        let output_file = get_output_file(link_info, folder);
        if output_file.exists() {
            let file_size = fs::metadata(&output_file).map(|m| m.len()).unwrap_or(0);
            existing_files_info.push((idx + 1, output_file.clone(), file_size as f64 / (1024.0 * 1024.0)));
        }
    }

    if !existing_files_info.is_empty() {
        println!("\n\x1b[1;33mThe following files already exist:\x1b[0m"); // Bold Yellow
        println!("{:<5} {:<50} {:>10}", "No.", "File Name", "Size (MB)");
        for (idx, output_file, size) in &existing_files_info {
            println!("{:<5} {:<50} {:>10.2}", idx, output_file.file_name().unwrap_or_default().to_str().unwrap_or_default(), size);
        }

        print!("Select the files to overwrite (e.g., 1-3,5), or press Enter to skip all existing: ");
        io::stdout().flush().unwrap();
        let mut choices_str = String::new();
        io::stdin().read_line(&mut choices_str).unwrap();
        let overwrite_indices = parse_number_ranges(choices_str.trim());

        let mut new_links = Vec::new();
        for (idx, link_info) in links.into_iter().enumerate() {
            if overwrite_indices.contains(&(idx + 1)) || !get_output_file(&link_info, folder).exists() {
                new_links.push(link_info);
            } else {
                 println!("Skipping existing file: {}", get_output_file(&link_info, folder).display());
            }
        }
        return new_links;
    }
    links
}

fn download_stream(
    task_id: usize,
    link_info: LinkInfo,
    folder: &str,
    settings: &Settings,
) {
    {
        let mut ad = ACTIVE_DOWNLOADS.lock().unwrap();
        ad.push((task_id, link_info.clone()));
    }

    let name = &link_info.name;
    let url = &link_info.url;
    let output_file = get_output_file(&link_info, folder);

    println!("\x1b[36mStarting download: {} -> {}\x1b[0m", name, output_file.display()); // Cyan

    for attempt in 1..=settings.retries {
        let mut ffmpeg_command_args = vec![
            "-y".to_string(),
            "-progress".to_string(), "pipe:1".to_string(),
            "-i".to_string(), url.to_string(),
            "-c".to_string(), "copy".to_string(),
            output_file.to_str().unwrap().to_string(),
        ];

        if let Some(speed_limit) = &settings.speed_limit {
            ffmpeg_command_args.extend(vec!["-limit_rate".to_string(), speed_limit.clone()]); // -limit_rate is preferred over -maxrate for recent ffmpeg
        }
        
        let process = Command::new("ffmpeg")
            .args(&ffmpeg_command_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped()) // Capture stderr as well, as ffmpeg often prints info there
            .spawn();

        match process {
            Ok(mut child) => {
                let stdout = child.stdout.take().expect("Failed to capture stdout from ffmpeg");
                let stderr_reader = child.stderr.take().map(io::BufReader::new); // Read stderr for duration

                let mut duration: Option<f64> = None;
                let start_time = std::time::Instant::now();

                // Spawn a thread to read stderr for duration (often found there)
                let duration_arc = Arc::new(Mutex::new(None::<f64>));
                if let Some(stderr_buf_reader) = stderr_reader {
                    let duration_clone = Arc::clone(&duration_arc);
                    thread::spawn(move || {
                        for line_result in stderr_buf_reader.lines() {
                            if let Ok(line) = line_result {
                                // eprintln!("[FFMPEG ERR][{}] {}", name, line); // For debugging
                                if line.contains("Duration:") {
                                    let parsed_dur = parse_duration(&line);
                                    if parsed_dur > 0.0 {
                                        *duration_clone.lock().unwrap() = Some(parsed_dur);
                                        break; // Found duration
                                    }
                                }
                            }
                        }
                    });
                }
                
                let reader = io::BufReader::new(stdout);
                for line_result in reader.lines() {
                    if let Ok(line) = line_result {
                        // println!("[FFMPEG OUT][{}] {}", name, line); // For debugging
                        if duration.is_none() { // Check if duration was found from stderr
                            duration = *duration_arc.lock().unwrap();
                        }

                        if line.contains("Duration:") && duration.is_none() { // Fallback if not in stderr
                            duration = Some(parse_duration(&line));
                        } else if line.contains("time=") && duration.is_some() {
                            let current_time = parse_time(&line);
                            let total_duration = duration.unwrap();
                            if total_duration > 0.0 {
                                let progress_percent = (current_time / total_duration * 100.0).min(100.0);
                                let elapsed_secs = start_time.elapsed().as_secs_f64();
                                let speed = if elapsed_secs > 0.0 { current_time / elapsed_secs } else { 0.0 }; // speed in terms of media time per wall time
                                let remaining_secs = if speed > 0.0 { (total_duration - current_time) / speed } else { 0.0 };
                                let size_mb = if output_file.exists() { output_file.metadata().map(|m|m.len() as f64 / (1024.0*1024.0)).unwrap_or(0.0)} else {0.0};

                                print!(
                                    "\r\x1b[36m{}: {:.1}% ({:.1}MB @ {:.1}x media speed, rem ~{:.0}s)\x1b[0K", // Cyan, 0K clears rest of line
                                    name, progress_percent, size_mb, speed, remaining_secs
                                );
                                io::stdout().flush().unwrap();
                            }
                        }
                        if line.starts_with("progress=end") { break; }
                    }
                }
                print!("\r"); // Clear progress line before final status

                let status = child.wait();
                match status {
                    Ok(exit_status) if exit_status.success() => {
                        let size_mb = output_file.metadata().map(|m| m.len() as f64 / (1024.0 * 1024.0)).unwrap_or(0.0);
                        println!("\x1b[32m{}: ✓ ({:.1}MB)\x1b[0K\x1b[0m", name, size_mb); // Green
                        break;
                    }
                    Ok(exit_status) => {
                        eprintln!("\n\x1b[31m{}: ffmpeg failed with code {:?}. Attempt {}/{}\x1b[0m", name, exit_status.code(), attempt, settings.retries);
                        if attempt == settings.retries { eprintln!("\x1b[31m{}: ✗ (Failed after {} retries)\x1b[0m", name, settings.retries); }
                        else { println!("\x1b[33m{}: Retrying...\x1b[0m", name); } // Yellow
                    }
                    Err(e) => {
                        eprintln!("\n\x1b[31m{}: Failed to wait on ffmpeg: {}. Attempt {}/{}\x1b[0m", name, e, attempt, settings.retries);
                         if attempt == settings.retries { eprintln!("\x1b[31m{}: ✗ (Error after {} retries)\x1b[0m", name, settings.retries); }
                    }
                }
            }
            Err(e) => {
                eprintln!("\n\x1b[31m{}: Failed to start ffmpeg: {}. Attempt {}/{}\x1b[0m", name, e, attempt, settings.retries);
                if attempt == settings.retries { eprintln!("\x1b[31m{}: ✗ (Failed to start ffmpeg after {} retries)\x1b[0m", name, settings.retries); }
            }
        }
        if attempt < settings.retries {
            thread::sleep(StdDuration::from_secs(2)); // Wait before retrying
        }
    }

    {
        let mut ad = ACTIVE_DOWNLOADS.lock().unwrap();
        ad.retain(|(id, _)| *id != task_id);
    }
}

fn setup_signal_handler() {
    // Using ctrlc crate would be like this:
    // ctrlc::set_handler(move || {
    //     println!("\n\x1b[1;33mCtrl+C detected. Active downloads:\x1b[0m");
    //     let ad = ACTIVE_DOWNLOADS.lock().unwrap();
    //     if ad.is_empty() {
    //         println!("No active downloads to cancel.");
    //         // Consider exiting if no downloads, or let main loop decide.
    //         // std::process::exit(130); // Standard exit for Ctrl+C
    //         return;
    //     }
    //     for (idx, (_task_id, link_info)) in ad.iter().enumerate() {
    //         println!("{}. {}", idx + 1, link_info.name);
    //     }
    //     drop(ad); // Release lock before stdin
    //
    //     print!("Enter numbers of downloads to cancel (e.g., 1-3,5), 'all', or Enter to skip: ");
    //     io::stdout().flush().unwrap();
    //     let mut choices_str = String::new();
    //     io::stdin().read_line(&mut choices_str).unwrap();
    //     let choices_str = choices_str.trim();
    //
    //     if choices_str.eq_ignore_ascii_case("all") {
    //         println!("\x1b[1;31mCancelling all downloads...\x1b[0m");
    //         let mut ad_mut = ACTIVE_DOWNLOADS.lock().unwrap();
    //         for (_task_id, link_info_to_cancel) in ad_mut.iter_mut() {
    //             println!("(Simulated cancellation for {})", link_info_to_cancel.name);
    //             // Actual cancellation would involve killing the ffmpeg process.
    //             // This requires storing the Child handle in LinkInfo and using child.kill().
    //         }
    //         ad_mut.clear();
    //         std::process::exit(130); // Exit after cancelling all
    //     } else if !choices_str.is_empty() {
    //         let cancel_indices_input = parse_number_ranges(choices_str); // 1-based
    //         let mut ad_mut = ACTIVE_DOWNLOADS.lock().unwrap();
    //         let mut remaining_downloads = Vec::new();
    //         let current_downloads_snapshot: Vec<_> = ad_mut.iter().enumerate().map(|(i, (task_id, li))| (i + 1, *task_id, li.clone())).collect();
    //         ad_mut.clear();
    //
    //         for (display_idx, task_id, link_info_to_check) in current_downloads_snapshot {
    //             if cancel_indices_input.contains(&display_idx) {
    //                 println!("\x1b[1;31mCancelling download: {}\x1b[0m", link_info_to_check.name);
    //                 // Actual cancellation logic
    //             } else {
    //                 remaining_downloads.push((task_id, link_info_to_check));
    //             }
    //         }
    //         *ad_mut = remaining_downloads;
    //         println!("\x1b[1;31mSelected downloads processed for cancellation.\x1b[0m");
    //     } else {
    //         println!("No downloads selected for cancellation. Continuing...");
    //     }
    // }).expect("Error setting Ctrl-C handler");
    println!("Note: Actual Ctrl+C handling requires the `ctrlc` crate and complex state management for process cancellation.");
    println!("Pressing Ctrl+C might terminate the program abruptly without graceful cancellation of downloads in this simplified version.");
}

fn run_main_logic() {
    println!("\x1b[1;34mM3U Batch Downloader for AniLINK (Rust Version)\x1b[0m"); // Bold Blue
    println!("Version: {}", VERSION);
    check_ffmpeg();

    print!("Path to your M3U file: ");
    io::stdout().flush().unwrap();
    let mut file_path_str = String::new();
    io::stdin().read_line(&mut file_path_str).unwrap();
    let file_path = sanitize_path(file_path_str.trim());

    if file_path.is_empty() {
        eprintln!("\x1b[31mNo M3U file path provided. Exiting.\x1b[0m");
        return;
    }
     if !Path::new(&file_path).exists() {
        eprintln!("\x1b[31mM3U file not found at: {}. Exiting.\x1b[0m", file_path);
        return;
    }


    let default_folder = Path::new(&file_path)
        .file_stem()
        .unwrap_or_default()
        .to_str()
        .unwrap_or("downloaded_videos")
        .to_string();
    
    let mut links = parse_m3u(&file_path);
    if links.is_empty() {
        println!("\x1b[31mNo links found in M3U file.\x1b[0m");
        return;
    }

    let folder = get_download_folder(&default_folder);
    let mut settings = load_settings();

    print!("Do you want to customize settings? (yes/no, default: no): ");
    io::stdout().flush().unwrap();
    let mut change_settings_str = String::new();
    io::stdin().read_line(&mut change_settings_str).unwrap();
    if change_settings_str.trim().eq_ignore_ascii_case("yes") {
        settings = customize_settings(settings);
    }

    links = check_existing_files(links, &folder);
    if links.is_empty() {
        println!("\x1b[1;32mNo files to download.\x1b[0m"); // Bold Green
        return;
    }

    println!("\n\x1b[1mStarting downloads...\x1b[0m\n"); // Bold

    let mut threads = vec![];
    let (token_sender, token_receiver) = std::sync::mpsc::channel::<()>();
    for _ in 0..settings.parallel_downloads {
        token_sender.send(()).unwrap();
    }
    let token_receiver = Arc::new(Mutex::new(token_receiver));
    let token_sender_clone = Arc::new(token_sender);

    for (idx, link_info) in links.into_iter().enumerate() {
        token_receiver.lock().unwrap().recv().expect("Failed to receive token from semaphore");

        let folder_clone = folder.clone();
        let settings_clone = settings.clone();
        let current_token_sender = Arc::clone(&token_sender_clone);
        
        let thread_handle = thread::spawn(move || {
            download_stream(idx, link_info, &folder_clone, &settings_clone);
            current_token_sender.send(()).expect("Failed to send token back to semaphore");
        });
        threads.push(thread_handle);
    }

    for thread in threads {
        thread.join().expect("Failed to join download thread");
    }

    println!("\n\x1b[1;32mAll downloads completed!\x1b[0m"); // Bold Green
}

fn clear_console() {
    if cfg!(target_os = "windows") {
        Command::new("cmd").args(&["/C", "cls"]).status().ok();
    } else {
        print!("\x1B[2J\x1B[1;1H"); // ANSI escape code for clearing screen
        io::stdout().flush().unwrap();
    }
}

pub fn run() {
    setup_signal_handler(); // Call this once
    loop {
        clear_console();
        run_main_logic();
        
        print!("\n\nDo you want to process another M3U file? (yes/no, default: no): ");
        io::stdout().flush().unwrap();
        let mut process_another_str = String::new();
        io::stdin().read_line(&mut process_another_str).unwrap();
        if !process_another_str.trim().eq_ignore_ascii_case("yes") {
            break;
        }
    }
}

// main function for binary execution if this file is compiled as