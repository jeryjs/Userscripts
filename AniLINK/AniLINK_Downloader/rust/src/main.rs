mod types;
mod process;
mod parser;
mod config;
mod utils;
mod tui;
mod downloader;

use anyhow::{anyhow, Context, Result};
use comfy_table::{presets::UTF8_FULL, Cell, ContentArrangement, Table};
use console::{style, Term};
use dialoguer::{Confirm, Input, theme::ColorfulTheme};
use futures_util::StreamExt;
use ini::Ini;
use parking_lot::Mutex;
use std::env;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::Semaphore;
use indicatif::{ProgressBar, ProgressStyle};

use types::*;
use parser::*;
use config::*;
use utils::*;
use downloader::*;

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

fn customize_settings(term: &Term, settings: &mut Settings) -> Result<()> {
    loop {
        term.clear_screen()?;
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .set_header(vec!["No.", "Setting", "Value"])
            .set_content_arrangement(ContentArrangement::Dynamic);

        table.add_row(vec!["1", "Parallel Downloads", &settings.parallel_downloads.to_string()]);
        table.add_row(vec!["2", "Retries", &settings.retries.to_string()]);
        table.add_row(vec!["3", "Speed Limit (e.g., 500k, 2M)", settings.speed_limit.as_deref().unwrap_or("None")]);
        table.add_row(vec!["4", "Timeout (seconds)", &settings.timeout.to_string()]);
        table.add_row(vec!["5", "FFmpeg Path", &settings.ffmpeg_path]);

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
                "1" => settings.parallel_downloads = Input::new()
                    .with_prompt("Enter the number of parallel downloads")
                    .default(settings.parallel_downloads)
                    .interact_text_on(term)?,
                "2" => settings.retries = Input::new()
                    .with_prompt("Enter the number of retries")
                    .default(settings.retries)
                    .interact_text_on(term)?,
                "3" => {
                    let limit: String = Input::new()
                        .with_prompt("Enter the speed limit (e.g., 500k, 2M)")
                        .default(settings.speed_limit.clone().unwrap_or_default())
                        .allow_empty(true)
                        .interact_text_on(term)?;
                    settings.speed_limit = if limit.is_empty() { None } else { Some(limit) };
                }
                "4" => settings.timeout = Input::new()
                    .with_prompt("Enter the download timeout in seconds")
                    .default(settings.timeout)
                    .interact_text_on(term)?,
                "5" => settings.ffmpeg_path = Input::new()
                    .with_prompt("Enter the FFmpeg path (or 'ffmpeg' for system PATH)")
                    .default(settings.ffmpeg_path.clone())
                    .interact_text_on(term)?,
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
            .with_prompt("ffmpeg not found. Download minimal version?")
            .default(true)
            .interact_on(term)?
        {
            download_ffmpeg(term, &PathBuf::from(".ffmpeg")).await?;
        } else {
            term.write_line(&format!("{}", style("ffmpeg is required.").red()))?;
            return Err(AppError::UserCancelled.into());
        }
    }
    Ok(())
}

async fn resolve_ffmpeg_path(settings: &Settings, term: &Term) -> Result<String> {
    let ffmpeg_path = &settings.ffmpeg_path;
    
    // If it's just "ffmpeg", try system PATH first
    if ffmpeg_path == "ffmpeg" || ffmpeg_path.is_empty() {
        if Command::new("ffmpeg")
            .arg("-version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await
            .is_ok()
        {
            return Ok("ffmpeg".to_string());
        }
    } else {
        // Check if the provided path exists
        let path = PathBuf::from(ffmpeg_path);
        if path.exists() && path.is_file() {
            return Ok(ffmpeg_path.clone());
        }
    }
    
    // Fallback: check temp directory
    let temp_dir = std::env::temp_dir().join("anilink_downloader");
    let temp_ffmpeg = if cfg!(windows) {
        temp_dir.join("ffmpeg").join("bin").join("ffmpeg.exe")
    } else {
        temp_dir.join("ffmpeg").join("bin").join("ffmpeg")
    };
    
    if temp_ffmpeg.exists() {
        return Ok(temp_ffmpeg.to_string_lossy().to_string());
    }
    
    // Need to download
    if Confirm::new()
        .with_prompt("ffmpeg not found. Download to temp directory?")
        .default(true)
        .interact_on(term)?
    {
        let downloaded_path = download_ffmpeg(term, &temp_dir).await?;
        return Ok(downloaded_path.to_string_lossy().to_string());
    }
    
    Err(AppError::UserCancelled.into())
}

async fn download_ffmpeg(term: &Term, target_dir: &Path) -> Result<PathBuf> {
    let ffmpeg_bin = if cfg!(windows) {
        target_dir.join("ffmpeg").join("bin").join("ffmpeg.exe")
    } else {
        target_dir.join("ffmpeg").join("bin").join("ffmpeg")
    };

    // Check if ffmpeg binary already exists
    if ffmpeg_bin.exists() {
        term.write_line("ffmpeg binary found, skipping download.")?;
        return Ok(ffmpeg_bin);
    }

    term.write_line("Downloading ffmpeg (multi-threaded)...")?;
    let ffmpeg_url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.7z";
    fs::create_dir_all(target_dir)?;
    let ffmpeg_archive = target_dir.join("ffmpeg.7z");

    // Skip download if archive exists
    if !ffmpeg_archive.exists() {
        let resp = reqwest::Client::new()
            .get(ffmpeg_url)
            .send()
            .await?
            .error_for_status()?;
        let total_size = resp.content_length().unwrap_or(0);

        let pb = ProgressBar::new(total_size);
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {bytes}/{total_bytes} ({bytes_per_sec}) ({eta})")
                .unwrap()
                .progress_chars("█▓▒░-"),
        );

        let mut file = File::create(&ffmpeg_archive)?;
        let mut stream = resp.bytes_stream();
        let mut downloaded: u64 = 0;

        while let Some(item) = stream.next().await {
            let chunk = item?;
            file.write_all(&chunk)?;
            downloaded += chunk.len() as u64;
            pb.set_position(downloaded);
        }
        pb.finish_with_message("Download complete");
    } else {
        term.write_line("Archive found, skipping download.")?;
    }

    // Check if already extracted
    if ffmpeg_bin.exists() {
        term.write_line("ffmpeg already extracted.")?;
        return Ok(ffmpeg_bin);
    }

    term.write_line("Extracting ffmpeg...")?;
    sevenz_rust::decompress_file(&ffmpeg_archive, target_dir)?;

    let ffmpeg_extracted = fs::read_dir(target_dir)?
        .filter_map(Result::ok)
        .find(|entry| entry.path().is_dir() && entry.file_name().to_string_lossy().starts_with("ffmpeg-"))
        .map(|entry| entry.path())
        .ok_or_else(|| anyhow!("Could not find extracted ffmpeg directory"))?;

    let ffmpeg_target = target_dir.join("ffmpeg");
    if !ffmpeg_target.exists() {
        fs::rename(&ffmpeg_extracted, &ffmpeg_target)?;
    }

    // Update PATH if using current directory
    if target_dir == Path::new(".ffmpeg") {
        let ffmpeg_bin_dir = ffmpeg_target.join("bin");
        let current_path = env::var("PATH").unwrap_or_default();
        let new_path = format!("{};{}", ffmpeg_bin_dir.to_str().unwrap(), current_path);
        env::set_var("PATH", new_path);
    }

    term.write_line("ffmpeg ready.")?;
    Ok(ffmpeg_bin)
}

fn check_existing_files(term: &Term, links: &[LinkInfo], folder: &Path) -> Result<Vec<LinkInfo>> {
    let mut existing_files = Vec::new();
    for (idx, link_info) in links.iter().enumerate() {
        let output_file = get_output_file(link_info, folder, links);
        if output_file.exists() {
            let file_size = output_file.metadata()?.len() as f64 / (1024.0 * 1024.0);
            existing_files.push((idx + 1, output_file.file_name().unwrap().to_string_lossy().to_string(), file_size));
        }
    }

    if !existing_files.is_empty() {
        term.write_line(&format!("\n{}", style("The following files already exist:").bold().yellow()))?;
        let mut table = Table::new();
        table.load_preset(UTF8_FULL).set_header(vec!["No.", "File Name", "Size (MB)"]);
        
        for (idx, file_name, size) in existing_files {
            table.add_row(vec![Cell::new(idx), Cell::new(&file_name), Cell::new(format!("{:.2}", size))]);
        }
        term.write_line(&format!("{}", table))?;

        let choices: String = Input::new()
            .with_prompt("Select the files to overwrite (e.g., 1-3,5)")
            .allow_empty(true)
            .interact_text_on(term)?;
        let overwrite_indices = parse_number_ranges(&choices);

        return Ok(links.iter().enumerate()
            .filter(|(idx, link_info)| {
                overwrite_indices.contains(&(idx + 1)) || !get_output_file(link_info, folder, links).exists()
            })
            .map(|(_, link_info)| link_info.clone())
            .collect());
    }

    Ok(links.to_vec())
}

async fn run_app(term: &Term) -> Result<()> {
    term.write_line(&format!("{} (v{})", style("M3U Batch Downloader for AniLINK").bold().blue(), VERSION))?;
    
    let config_dir = get_config_dir()?;
    let config_file = config_dir.join("settings.ini");
    let conf = Ini::load_from_file(&config_file).unwrap_or_default();
    let mut settings = load_settings(&conf);
    
    // Resolve ffmpeg path early
    let ffmpeg_path = resolve_ffmpeg_path(&settings, term).await?;
    term.write_line(&format!("Using ffmpeg: {}", style(&ffmpeg_path).cyan()))?;

    let file_path_str: String = Input::new()
        .with_prompt("Path to your M3U file")
        .interact_text_on(term)?;
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

    let default_folder = file_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
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

    if Confirm::with_theme(&get_custom_theme())
        .with_prompt("Do you want to customize settings?")
        .default(false)
        .interact_on(term)?
    {
        customize_settings(term, &mut settings)?;
        save_settings(&config_file, &settings)?;
        // Re-resolve ffmpeg if path changed
        let new_ffmpeg_path = resolve_ffmpeg_path(&settings, term).await?;
        settings.ffmpeg_path = new_ffmpeg_path;
    }

    let links_to_download = check_existing_files(term, &links, &folder)?;
    if links_to_download.is_empty() {
        term.write_line(&format!("{}", style("No new files to download.").bold().green()))?;
        return Ok(());
    }

    term.write_line(&format!("\n{}\n", style("Press Ctrl+C to exit...").bold()))?;

    // Initialize shared state for TUI
    let downloads_state: Arc<Mutex<Vec<(LinkInfo, DownloadStatus)>>> = Arc::new(Mutex::new(
        links_to_download.iter().map(|li| (li.clone(), DownloadStatus::Pending)).collect()
    ));

    let tui_state = downloads_state.clone();
    let download_state = downloads_state.clone();

    // Spawn TUI in separate task
    let tui_handle = tokio::spawn(async move {
        let download_tui = tui::DownloadTUI::new_with_state(tui_state);
        tui::run_tui(download_tui)
    });

    // Spawn downloads
    // No delay; spawn immediately
    
    let semaphore = Arc::new(Semaphore::new(settings.parallel_downloads));
    let mut tasks = Vec::new();

    for link_info in links_to_download {
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let settings_clone = settings.clone();
        let folder_clone = folder.clone();
        let all_links_clone = links.clone();
        let state = download_state.clone();
        let link_id = link_info.id;

        tasks.push(tokio::spawn(async move {
            let result = download_stream(
                link_info,
                folder_clone,
                settings_clone,
                all_links_clone,
                state,
                link_id,
            ).await;
            
            drop(permit);
            result
        }));
    }

    // Wait for all downloads
    for task in tasks {
        let _ = task.await;
    }

    // Wait a bit then exit TUI
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    let _ = tui_handle.await;

    term.write_line(&format!("\n{}", style("All downloads completed!").bold().green()))?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let term = Arc::new(Term::stdout());

    loop {
        let _ = term.clear_screen();
        if let Err(e) = run_app(&term).await {
            let _ = term.write_line(&format!("\n{}\n", style(format!("An unexpected error occurred: {}", e)).red()));
        }

        if !Confirm::with_theme(&get_custom_theme())
            .with_prompt("\n\nDo you want to process another M3U file?")
            .default(false)
            .interact_on(&term)
            .unwrap_or(false)
        {
            break;
        }
    }

    Ok(())
}