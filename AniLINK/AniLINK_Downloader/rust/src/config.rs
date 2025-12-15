use anyhow::{anyhow, Result};
use ini::Ini;
use std::fs;
use std::path::{Path, PathBuf};
use crate::types::Settings;

pub fn get_config_dir() -> Result<PathBuf> {
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

pub fn load_settings(conf: &Ini) -> Settings {
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
    let ffmpeg_path = section
        .and_then(|s| s.get("ffmpeg_path"))
        .map(|v| v.to_string())
        .unwrap_or_else(|| "ffmpeg".to_string());

    Settings {
        parallel_downloads,
        retries,
        speed_limit,
        timeout,
        ffmpeg_path,
    }
}

pub fn save_settings(config_file: &Path, settings: &Settings) -> Result<()> {
    let mut conf = Ini::new();
    conf.with_section(Some("Settings"))
        .set("parallel_downloads", settings.parallel_downloads.to_string())
        .set("retries", settings.retries.to_string())
        .set("speed_limit", settings.speed_limit.as_deref().unwrap_or(""))
        .set("timeout", settings.timeout.to_string())
        .set("ffmpeg_path", &settings.ffmpeg_path);
    conf.write_to_file(config_file)?;
    Ok(())
}
