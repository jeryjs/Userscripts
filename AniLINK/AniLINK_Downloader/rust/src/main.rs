use anyhow::{anyhow, Context, Result};
use comfy_table::{presets::UTF8_FULL, Cell, ContentArrangement, Table};
use console::{style, Term};
use dialoguer::{Confirm, Input, MultiSelect, theme::ColorfulTheme};
use futures_util::StreamExt;
use indicatif::{MultiProgress, ProgressBar, ProgressDrawTarget, ProgressStyle};
use ini::Ini;
use lazy_static::lazy_static;
use parking_lot::Mutex;
use regex::Regex;
use sanitize_filename::sanitize;
use std::collections::{BTreeSet};
use std::env;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Write};
use tokio::io::{AsyncBufReadExt, BufReader as AsyncBufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;
use tokio::process::Command;
use tokio::sync::Semaphore;
use std::process::Command as StdCommand;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

const VERSION: &str = "2.0.0";

fn get_custom_theme() -> ColorfulTheme {
    ColorfulTheme {
        defaults_style: console::Style::new().cyan(),
        prompt_style: console::Style::new(),
        prompt_prefix: console::style("".to_string()),
        prompt_suffix: console::style("".to_string()),
        success_prefix: console::style("".to_string()),
        success_suffix: console::style("".to_string()),
        error_prefix: console::style("".to_string()),
        error_style: console::Style::new().red(),
        hint_style: console::Style::new().black().bright(),
        values_style: console::Style::new().cyan(),
        active_item_style: console::Style::new().cyan(),
        inactive_item_style: console::Style::new(),
        active_item_prefix: console::style("".to_string()),
        inactive_item_prefix: console::style("".to_string()),
        checked_item_prefix: console::style("".to_string()),
        unchecked_item_prefix: console::style("".to_string()),
        picked_item_prefix: console::style("".to_string()),
        unpicked_item_prefix: console::style("".to_string()),
        inline_selections: true,
    }
}

#[derive(Error, Debug)]
enum AppError {
    #[error("ffmpeg exited with code {0}")]
    FfmpegError(i32),
    #[error("User cancelled operation")]
    UserCancelled,
}

#[derive(Debug, Clone)]
struct Subtitle {
    name: String,
    url: String,
    default: bool,
}

#[derive(Debug, Clone)]
struct LinkInfo {
    id: usize, // Unique ID for each link
    name: String,
    url: String,
    referer: Option<String>,
    subtitles: Vec<Subtitle>,
    quality: Option<String>,
    process_id: Arc<Mutex<Option<u32>>>,
}

#[derive(Debug, Clone)]
struct Settings {
    parallel_downloads: usize,
    retries: u32,
    speed_limit: Option<String>,
    timeout: u64,
}

lazy_static! {
    static ref ACTIVE_DOWNLOADS: Mutex<Vec<(ProgressBar, LinkInfo)>> = Mutex::new(Vec::new());
}

fn get_config_dir() -> Result<PathBuf> {
    let path = if cfg!(windows) {
        dirs_next::data_local_dir()
            .ok_or_else(|| anyhow!("Could not find local app data directory"))?
            .join("m3u_downloader")
    } else {
        dirs_next::config_dir()
            .ok_or_else(|| anyhow!("Could not find config directory"))?
            .join("m3u_downloader")
    };
    fs::create_dir_all(&path)?;
    Ok(path)
}

fn load_settings(conf: &Ini) -> Settings {
    let section = conf.section(Some("Settings"));
    let parallel_downloads = section
        .and_then(|s| s.get("parallel_downloads"))
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(4);
    let retries = section
        .and_then(|s| s.get("retries"))
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(3);
    let speed_limit = section
        .and_then(|s| s.get("speed_limit"))
        .and_then(|v| if v.is_empty() { None } else { Some(v.to_string()) });
    let timeout = section
        .and_then(|s| s.get("timeout"))
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(30);

    Settings {
        parallel_downloads,
        retries,
        speed_limit,
        timeout,
    }
}

fn save_settings(config_file: &Path, settings: &Settings) -> Result<()> {
    let mut conf = Ini::new();
    conf.with_section(Some("Settings"))
        .set(
            "parallel_downloads",
            settings.parallel_downloads.to_string(),
        )
        .set("retries", settings.retries.to_string())
        .set(
            "speed_limit",
            settings.speed_limit.as_deref().unwrap_or(""),
        )
        .set("timeout", settings.timeout.to_string());
    conf.write_to_file(config_file)?;
    Ok(())
}

fn customize_settings(term: &Term, settings: &mut Settings) -> Result<()> {
    loop {
        term.clear_screen()?;
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .set_header(vec!["No.", "Setting", "Value"])
            .set_content_arrangement(ContentArrangement::Dynamic);

        table.add_row(vec![
            "1",
            "Parallel Downloads",
            &settings.parallel_downloads.to_string(),
        ]);
        table.add_row(vec!["2", "Retries", &settings.retries.to_string()]);
        table.add_row(vec![
            "3",
            "Speed Limit (e.g., 500k, 2M)",
            settings.speed_limit.as_deref().unwrap_or("None"),
        ]);
        table.add_row(vec![
            "4",
            "Timeout (seconds)",
            &settings.timeout.to_string(),
        ]);

        term.write_line(&format!("{}", table))?;

        let choices: String = Input::new()
            .with_prompt("Enter the numbers of the settings you want to change (e.g., 1,3)")
            .allow_empty(true)
            .interact_text_on(term)?;

        if choices.is_empty() {
            break;
        }

        for choice in choices.split(',') {
            match choice.trim() {
                "1" => {
                    settings.parallel_downloads = Input::new()
                        .with_prompt("Enter the number of parallel downloads")
                        .default(settings.parallel_downloads)
                        .interact_text_on(term)?;
                }
                "2" => {
                    settings.retries = Input::new()
                        .with_prompt("Enter the number of retries")
                        .default(settings.retries)
                        .interact_text_on(term)?;
                }
                "3" => {
                    let limit: String = Input::new()
                        .with_prompt("Enter the speed limit (e.g., 500k, 2M)")
                        .default(settings.speed_limit.clone().unwrap_or_default())
                        .allow_empty(true)
                        .interact_text_on(term)?;
                    settings.speed_limit = if limit.is_empty() { None } else { Some(limit) };
                }
                "4" => {
                    settings.timeout = Input::new()
                        .with_prompt("Enter the download timeout in seconds")
                        .default(settings.timeout)
                        .interact_text_on(term)?;
                }
                _ => {}
            }
        }

        if !Confirm::new()
            .with_prompt("Do you want to change more settings?")
            .default(false)
            .interact_on(term)?
        {
            break;
        }
    }
    Ok(())
}

async fn check_ffmpeg(term: &Term) -> Result<()> {
    if Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .is_err()
    {
        if Confirm::new()
            .with_prompt(format!(
                "{} ffmpeg not found. Download minimal version?",
                style("[red]").bold()
            ))
            .default(true)
            .interact_on(term)?
        {
            download_ffmpeg(term).await?;
        } else {
            term.write_line(&format!("{}", style("ffmpeg is required.").red()))?;
            return Err(AppError::UserCancelled.into());
        }
    }
    Ok(())
}

async fn download_ffmpeg(term: &Term) -> Result<()> {
    term.write_line("Downloading minimal ffmpeg...")?;
    let ffmpeg_url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.7z";
    let ffmpeg_dir = PathBuf::from(".ffmpeg");
    fs::create_dir_all(&ffmpeg_dir)?;
    let ffmpeg_archive = ffmpeg_dir.join("ffmpeg.7z");

    let mut stream = reqwest::get(ffmpeg_url).await?.bytes_stream();
    let mut file = File::create(&ffmpeg_archive)?;

    while let Some(item) = stream.next().await {
        let chunk = item?;
        file.write_all(&chunk)?;
    }

    sevenz_rust::decompress_file(&ffmpeg_archive, &ffmpeg_dir)?;

    let ffmpeg_bin_name = fs::read_dir(&ffmpeg_dir)?
        .filter_map(Result::ok)
        .find(|entry| entry.path().is_dir() && entry.file_name().to_string_lossy().starts_with("ffmpeg-"))
        .map(|entry| entry.path())
        .ok_or_else(|| anyhow!("Could not find extracted ffmpeg directory"))?;

    let ffmpeg_bin = ffmpeg_bin_name.join("bin");

    let current_path = env::var("PATH").unwrap_or_default();
    let new_path = format!("{};{}", ffmpeg_bin.to_str().unwrap(), current_path);
    env::set_var("PATH", new_path);

    term.write_line("ffmpeg installed.")?;
    Ok(())
}

fn parse_m3u(file_path: &Path) -> Result<Vec<LinkInfo>> {
    let file = File::open(file_path)?;
    let reader = BufReader::new(file);
    let lines: Vec<String> = reader.lines().collect::<Result<_, _>>()?;

    let mut links = Vec::new();
    let mut referer: Option<String> = None;
    let mut subtitles: Vec<Subtitle> = Vec::new();

    let name_re = Regex::new(r#"NAME="([^"]+)""#).unwrap();
    let uri_re = Regex::new(r#"URI="([^"]+)""#).unwrap();

    for (i, line) in lines.iter().enumerate() {
        if let Some(r) = line.strip_prefix("#EXTVLCOPT:http-referrer=") {
            referer = Some(r.to_string());
        } else if line.starts_with("#EXT-X-MEDIA:TYPE=SUBTITLES") {
            let name = name_re
                .captures(line)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| "Subtitle".to_string());
            if let Some(uri_cap) = uri_re.captures(line) {
                if let Some(url) = uri_cap.get(1) {
                    subtitles.push(Subtitle {
                        name,
                        url: url.as_str().to_string(),
                        default: line.contains("DEFAULT=YES"),
                    });
                }
            }
        } else if let Some(info) = line.strip_prefix("#EXTINF:") {
            let name = info
                .split(',')
                .nth(1)
                .unwrap_or(&format!("Episode {}", links.len() + 1))
                .to_string();
            if let Some(url) = lines.get(i + 1) {
                if !url.starts_with('#') {
                    // Remove .mp4 or .m3u8 extension from the name if present
                    let mut parsed_name = name.clone();
                    if let Some(stripped) = parsed_name.strip_suffix(".mp4") {
                        parsed_name = stripped.to_string();
                    } else if let Some(stripped) = parsed_name.strip_suffix(".m3u8") {
                        parsed_name = stripped.to_string();
                    }
                    let mut quality = None;
                    if let (Some(start), Some(end)) = (name.rfind('['), name.rfind(']')) {
                        if start < end {
                            quality = Some(name[start..=end].to_string());
                            parsed_name = name[..start].trim().to_string();
                        }
                    }
                    links.push(LinkInfo {
                        id: links.len(),
                        name: parsed_name,
                        url: url.clone(),
                        referer: referer.clone(),
                        subtitles: subtitles.clone(),
                        quality,
                        process_id: Arc::new(Mutex::new(None)),
                    });
                    subtitles.clear();
                }
            }
        }
    }
    Ok(links)
}

fn parse_number_ranges(s: &str) -> BTreeSet<usize> {
    let mut result = BTreeSet::new();
    for part in s.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some((a_str, b_str)) = part.split_once('-') {
            if let (Ok(a), Ok(b)) = (a_str.trim().parse(), b_str.trim().parse()) {
                for i in a..=b {
                    result.insert(i);
                }
            }
        } else if let Ok(n) = part.parse() {
            result.insert(n);
        }
    }
    result
}

fn get_output_file(
    link_info: &LinkInfo,
    folder: &Path,
    all_links: &[LinkInfo],
) -> PathBuf {
    let mut name_without_ext = link_info.name.clone();

    // Smart quality tagging
    if let Some(quality) = &link_info.quality {
        let base_name = &link_info.name;
        let duplicates: Vec<_> = all_links
            .iter()
            .filter(|l| l.name == *base_name)
            .map(|l| l.id)
            .collect();
        if duplicates.len() > 1 {
            if let Some(pos) = duplicates.iter().position(|&id| id == link_info.id) {
                if pos > 0 {
                    name_without_ext = format!("{} {}", name_without_ext, quality);
                }
            }
        }
    }

    let sanitized_name = sanitize(&name_without_ext);
    folder.join(format!("{}.mkv", sanitized_name))
}

fn check_existing_files(
    term: &Term,
    links: &[LinkInfo],
    folder: &Path,
) -> Result<Vec<LinkInfo>> {
    let mut existing_files = Vec::new();
    for (idx, link_info) in links.iter().enumerate() {
        let output_file = get_output_file(link_info, folder, links);
        if output_file.exists() {
            let file_size = output_file.metadata()?.len() as f64 / (1024.0 * 1024.0);
            existing_files.push((
                idx + 1,
                output_file.file_name().unwrap().to_string_lossy().to_string(),
                file_size,
            ));
        }
    }

    if !existing_files.is_empty() {
        term.write_line(&format!(
            "\n{}",
            style("The following files already exist:").bold().yellow()
        ))?;
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .set_header(vec!["No.", "File Name", "Size (MB)"]);
        
        for (idx, file_name, size) in existing_files {
            table.add_row(vec![
                Cell::new(idx),
                Cell::new(&file_name),
                Cell::new(format!("{:.2}", size)),
            ]);
        }
        term.write_line(&format!("{}", table))?;

        let choices: String = Input::new()
            .with_prompt("Select the files to overwrite (e.g., 1-3,5)")
            .allow_empty(true)
            .interact_text_on(term)?;
        let overwrite_indices = parse_number_ranges(&choices);

        let new_links = links
            .iter()
            .enumerate()
            .filter(|(idx, link_info)| {
                overwrite_indices.contains(&(idx + 1))
                    || !get_output_file(link_info, folder, links).exists()
            })
            .map(|(_, link_info)| link_info.clone())
            .collect();
        return Ok(new_links);
    }

    Ok(links.to_vec())
}

fn parse_ffmpeg_duration(line: &str) -> Option<f64> {
    let time_str = line.split("Duration: ").nth(1)?.split(',').next()?;
    if time_str.contains("N/A") {
        return None;
    }
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().ok()?;
        let m: f64 = parts[1].parse().ok()?;
        let s: f64 = parts[2].parse().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else {
        None
    }
}

fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    let time_str = line.split("time=").nth(1)?.split_whitespace().next()?;
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().ok()?;
        let m: f64 = parts[1].parse().ok()?;
        let s: f64 = parts[2].parse().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else {
        None
    }
}

async fn download_stream(
    link_info: LinkInfo,
    folder: PathBuf,
    mp: MultiProgress,
    settings: Settings,
    all_links: Vec<LinkInfo>,
) -> Result<()> {
    let name = link_info.name.clone();
    let output_file = get_output_file(&link_info, &folder, &all_links);

    let pb = mp.add(ProgressBar::new(100));
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} {msg} {bar:40.cyan/blue} {percent:>3}%")?
            .progress_chars("##-"),
    );
    pb.set_message(format!("{}", style(&name).cyan()));

    ACTIVE_DOWNLOADS.lock().push((pb.clone(), link_info.clone()));

    for attempt in 1..=settings.retries {
        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y").arg("-progress").arg("pipe:1");

        if let Some(referer) = &link_info.referer {
            cmd.arg("-headers")
                .arg(format!("Referer: {}\r\n", referer));
        }

        cmd.arg("-i").arg(&link_info.url);

        for sub in &link_info.subtitles {
            cmd.arg("-i").arg(&sub.url);
        }

        cmd.arg("-c").arg("copy");

        for (i, sub) in link_info.subtitles.iter().enumerate() {
            let lang = sub.name.chars().take(3).collect::<String>().to_lowercase();
            cmd.arg(format!("-metadata:s:s:{}", i))
                .arg(format!("language={}", lang));
            cmd.arg(format!("-metadata:s:s:{}", i))
                .arg(format!("title={}", sub.name));
            if sub.default {
                cmd.arg(format!("-disposition:s:{}", i)).arg("default");
            }
        }

        cmd.arg("-metadata").arg(format!("title={}", name));

        if let Some(speed_limit) = &settings.speed_limit {
            cmd.arg("-maxrate").arg(speed_limit);
        }

        cmd.arg(&output_file);

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = cmd.spawn()?;
        *link_info.process_id.lock() = child.id();

        let stderr = child.stderr.take().unwrap();
        let mut reader = AsyncBufReader::new(stderr).lines();

        let mut duration: Option<f64> = None;
        let start_time = tokio::time::Instant::now();

        pb.set_position(0);

        while let Some(line) = reader.next_line().await? {
            if line.contains("Duration") {
                duration = parse_ffmpeg_duration(&line).or(duration);
            } else if line.contains("time=") && duration.is_some() {
                if let Some(current_time) = parse_ffmpeg_time(&line) {
                    let total_duration = duration.unwrap();
                    let progress = (current_time / total_duration * 100.0).min(100.0);
                    pb.set_position(progress as u64);

                    let elapsed = start_time.elapsed().as_secs_f64();
                    let speed = if elapsed > 0.0 { current_time / elapsed } else { 0.0 };
                    let remaining = if speed > 0.0 { (total_duration - current_time) / speed } else { 0.0 };
                    let size_mb = fs::metadata(&output_file).map(|m| m.len() as f64 / 1_048_576.0).unwrap_or(0.0);

                    pb.set_message(format!(
                        "{} - {:.1}MB @ {:.2}x ({:.0}/{:.0}s) [~{:.0}s]",
                        style(&name).cyan(),
                        size_mb,
                        speed,
                        current_time,
                        total_duration,
                        remaining
                    ));
                }
            }
        }

        let status = child.wait().await?;

        if status.success() {
            let size_mb = fs::metadata(&output_file)?.len() as f64 / 1_048_576.0;
            pb.finish_with_message(format!(
                "{} ✓ ({:.1}MB)",
                style(name).green(),
                size_mb
            ));
            ACTIVE_DOWNLOADS.lock().retain(|(_, li)| li.id != link_info.id);
            return Ok(());
        } else {
            if attempt == settings.retries {
                pb.finish_with_message(format!(
                    "{} ✗ (ffmpeg exited with code {})",
                    style(name).red(),
                    status.code().unwrap_or(-1)
                ));
                ACTIVE_DOWNLOADS.lock().retain(|(_, li)| li.id != link_info.id);
                return Err(AppError::FfmpegError(status.code().unwrap_or(-1)).into());
            } else {
                println!(
                    "{}",
                    style(format!("{}: Retry {}/{}", name, attempt, settings.retries)).yellow()
                );
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
    ACTIVE_DOWNLOADS.lock().retain(|(_, li)| li.id != link_info.id);
    Err(anyhow!("Download failed after all retries"))
}

fn setup_ctrlc_handler(term: Arc<Term>) -> Result<()> {

    static EXIT_REQUESTED: OnceLock<AtomicBool> = OnceLock::new();

    EXIT_REQUESTED.get_or_init(|| AtomicBool::new(false));

    ctrlc::set_handler(move || {
        let exit_requested = EXIT_REQUESTED.get().unwrap();

        if exit_requested.load(Ordering::SeqCst) {
            // Second Ctrl+C: exit immediately
            std::process::exit(0);
        }

        let active = ACTIVE_DOWNLOADS.lock();
        if active.is_empty() {
            // If no downloads, exit gracefully
            std::process::exit(0);
        }

        let _ = term.write_line(&format!(
            "\n\n{}\n\n",
            style("Ctrl+C detected. Current downloads:").bold().yellow()
        ));

        let items: Vec<_> = active.iter().map(|(_, li)| li.name.clone()).collect();
        if items.is_empty() {
            return;
        }

        if let Ok(to_cancel_indices) = MultiSelect::new()
            .with_prompt("Select downloads to cancel (space to select, enter to confirm)\n(Press Ctrl+C again to exit immediately)")
            .items(&items)
            .interact_on(&term)
        {
            let mut active_mut = active;
            let mut cancelled_any = false;

            let ids_to_cancel: Vec<usize> = to_cancel_indices.iter().map(|&i| active_mut[i].1.id).collect();

            for id_to_cancel in &ids_to_cancel {
                if let Some((_i, (pb, link_info))) = active_mut.iter().enumerate().find(|(_, (_, li))| li.id == *id_to_cancel) {
                    pb.finish_with_message(format!("{} ✗ (Cancelled)", style(&link_info.name).red()));
                    if let Some(pid) = *link_info.process_id.lock() {
                        #[cfg(windows)]
                        {
                            // Use taskkill to terminate the process and its children
                            let _ = StdCommand::new("taskkill")
                                .args(&["/PID", &pid.to_string(), "/T", "/F"])
                                .output();
                        }
                        #[cfg(not(windows))]
                        {
                            // On Unix, send SIGTERM
                            let _ = nix::sys::signal::kill(
                                nix::unistd::Pid::from_raw(pid as i32),
                                nix::sys::signal::Signal::SIGTERM,
                            );
                        }
                    }
                    cancelled_any = true;
                }
            }

            active_mut.retain(|(_, li)| !ids_to_cancel.contains(&li.id));

            if cancelled_any {
                let _ = term.write_line(&format!(
                    "{}",
                    style("Cancelling selected downloads...").bold().red()
                ));
            }
        }

        // Set the flag so next Ctrl+C will exit
        exit_requested.store(true, Ordering::SeqCst);
        let _ = term.write_line(&format!(
            "{}",
            style("Press Ctrl+C again to exit the program immediately.").bold().red()
        ));
    })?;
    Ok(())
}

async fn run_app(term: &Term) -> Result<()> {
    term.write_line(&format!(
        "{} (v{})",
        style("M3U Batch Downloader for AniLINK").bold().blue(),
        VERSION
    ))?;
    check_ffmpeg(term).await?;

    let file_path_str: String = Input::new()
        .with_prompt("Path to your M3U file")
        .interact_text_on(term)?;
    // Try to expand ~, handle absolute/relative, and remove quotes
    let input = file_path_str.trim().trim_matches('"').trim_matches('\'');
    let file_path = if input.starts_with('~') {
        if let Some(home) = dirs_next::home_dir() {
            home.join(&input[1..])
        } else {
            PathBuf::from(input)
        }
    } else {
        PathBuf::from(input)
    };

    let default_folder = file_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let links = parse_m3u(&file_path).context("Failed to parse M3U file")?;
    if links.is_empty() {
        term.write_line(&format!("{}", style("No links found in M3U file.").red()))?;
        return Ok(());
    }

    let folder_str: String = Input::with_theme(&get_custom_theme())
        .with_prompt("Enter the name of the folder to save videos in")
        .default(default_folder)
        .interact_text_on(term)?;
    let folder = PathBuf::from(folder_str);
    fs::create_dir_all(&folder)?;

    let config_dir = get_config_dir()?;
    let config_file = config_dir.join("settings.ini");
    let conf = Ini::load_from_file(&config_file).unwrap_or_default();
    let mut settings = load_settings(&conf);

    if Confirm::with_theme(&get_custom_theme())
        .with_prompt("Do you want to customize settings?")
        .default(false)
        .interact_on(term)?
    {
        customize_settings(term, &mut settings)?;
        save_settings(&config_file, &settings)?;
    }

    let links_to_download = check_existing_files(term, &links, &folder)?;
    if links_to_download.is_empty() {
        term.write_line(&format!(
            "{}",
            style("No new files to download.").bold().green()
        ))?;
        return Ok(());
    }

    term.write_line(&format!(
        "\n{}\n",
        style("Starting downloads...").bold()
    ))?;

    let mp = MultiProgress::new();
    mp.set_draw_target(ProgressDrawTarget::stdout());
    let semaphore = Arc::new(Semaphore::new(settings.parallel_downloads));
    let mut tasks = Vec::new();

    let all_links_for_naming = links.clone();
    for link_info in links_to_download.into_iter() {
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let mp_clone = mp.clone();
        let settings_clone = settings.clone();
        let folder_clone = folder.clone();
        let all_links_clone = all_links_for_naming.clone();

        tasks.push(tokio::spawn(async move {
            let result = download_stream(
                link_info,
                folder_clone,
                mp_clone,
                settings_clone,
                all_links_clone,
            )
            .await;
            drop(permit);
            result
        }));
    }

    for task in tasks {
        if let Err(e) = task.await? {
            // Errors are already printed by the download function's progress bar
             eprintln!("{}", style(format!("A download task failed: {}", e)).red());
        }
    }

    mp.clear()?;
    term.write_line(&format!(
        "\n{}",
        style("All downloads completed!").bold().green()
    ))?;

    Ok(())
}

#[tokio::main]
async fn main() {
    let term = Arc::new(Term::stdout());
    if let Err(e) = setup_ctrlc_handler(term.clone()) {
        let _ = term.write_line(&format!("Error setting up Ctrl-C handler: {}", e));
    }

    loop {
        let _ = term.clear_screen();
        if let Err(e) = run_app(&term).await {
            let _ = term.write_line(&format!(
                "\n{}\n",
                style(format!("An unexpected error occurred: {}", e)).red()
            ));
        }

        if !Confirm::new()
            .with_prompt("\n\nDo you want to process another M3U file?")
            .default(false)
            .interact_on(&term)
            .unwrap_or(false)
        {
            break;
        }
    }
}