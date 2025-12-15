mod types;
mod process;
mod parser;
mod config;
mod utils;
mod tui;
mod downloader;
mod ffmpeg;
mod ui;

use anyhow::{Context, Result};
use console::{style, Term};
use dialoguer::{Confirm, Input, theme::ColorfulTheme};
use ini::Ini;
use parking_lot::Mutex;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Semaphore;

use types::*;
use parser::parse_m3u;
use config::*;

const VERSION: &str = "2.0.0";

fn get_custom_theme() -> ColorfulTheme {
    ColorfulTheme {
        defaults_style: console::Style::new().cyan(),
        active_item_style: console::Style::new().cyan(),
        error_style: console::Style::new().red(),
        hint_style: console::Style::new().black().bright(),
        values_style: console::Style::new().cyan(),
        inline_selections: true,
        ..Default::default()
    }
}

async fn run_app(term: &Term) -> Result<()> {
    term.write_line(&format!("{} {}", style("M3U Batch Downloader for AniLINK").bold().blue(), style(format!("(v{})", VERSION)).dim()))?;
    
    let config_dir = get_config_dir()?;
    let config_file = config_dir.join("settings.ini");
    let conf = Ini::load_from_file(&config_file).unwrap_or_default();
    let mut settings = load_settings(&conf);
    
    let resolve_result = ffmpeg::resolve_path(&settings.ffmpeg_path, &config_dir, term).await?;
    let ffmpeg_path = resolve_result.path.clone();
    
    if resolve_result.config_needs_update {
        settings.ffmpeg_path = ffmpeg_path.clone();
        save_settings(&config_file, &settings)?;
        term.write_line(&format!("Config updated with ffmpeg path: {}", style(&ffmpeg_path).cyan()))?;
    }
    
    term.write_line(&format!("Using ffmpeg: {}", style(&ffmpeg_path).cyan()))?;

    let file_path_str: String = Input::new().with_prompt("Path to your M3U file").interact_text_on(term)?;
    let input = file_path_str.trim().trim_matches('"').trim_matches('\'');
    let file_path: PathBuf = if input.starts_with('~') {
        dirs_next::home_dir().map(|h| h.join(&input[1..])).unwrap_or_else(|| input.into())
    } else {
        input.into()
    };

    let links = parse_m3u(&file_path).context("Failed to parse M3U file")?;
    if links.is_empty() {
        term.write_line(&format!("{}", style("No links found in M3U file.").red()))?;
        return Ok(());
    }

    let folder_str: String = Input::with_theme(&get_custom_theme())
        .with_prompt("Folder to save videos in")
        .default(file_path.file_stem().unwrap_or_default().to_string_lossy().to_string())
        .interact_text_on(term)?;
    let folder: PathBuf = folder_str.into();
    fs::create_dir_all(&folder)?;

    if Confirm::with_theme(&get_custom_theme()).with_prompt("Customize settings?").default(false).interact_on(term)? {
        ui::customize(term, &mut settings)?;
        save_settings(&config_file, &settings)?;
        let new_resolve_result = ffmpeg::resolve_path(&settings.ffmpeg_path, &config_dir, term).await?;
        if new_resolve_result.config_needs_update {
            settings.ffmpeg_path = new_resolve_result.path.clone();
            save_settings(&config_file, &settings)?;
        }
    }

    let links_to_download = ui::check_existing(term, &links, &folder)?;
    if links_to_download.is_empty() {
        term.write_line(&format!("{}", style("No new files to download.").bold().green()))?;
        return Ok(());
    }

    term.write_line(&format!("\n{}\n", style("Press Shift+Q to exit...").bold()))?;

    let downloads_state: Arc<Mutex<Vec<(LinkInfo, DownloadStatus)>>> = Arc::new(Mutex::new(
        links_to_download.iter().map(|li| (li.clone(), DownloadStatus::Pending)).collect()
    ));

    let tui_handle = tokio::spawn({
        let state = downloads_state.clone();
        async move { tui::run_tui(tui::DownloadTUI::new_with_state(state)) }
    });

    let semaphore = Arc::new(Semaphore::new(settings.parallel_downloads));
    let mut tasks = Vec::new();

    for link_info in links_to_download {
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let (settings_clone, folder_clone, all_links, state, link_id) = 
            (settings.clone(), folder.clone(), links.clone(), downloads_state.clone(), link_info.id);

        tasks.push(tokio::spawn(async move {
            let result = downloader::download_stream(link_info, folder_clone, settings_clone, all_links, state, link_id).await;
            drop(permit);
            result
        }));
    }

    for task in tasks { let _ = task.await; }
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
        if !Confirm::with_theme(&get_custom_theme()).with_prompt("\n\nProcess another M3U file?").default(false).interact_on(&term).unwrap_or(false) {
            break;
        }
    }
    Ok(())
}
