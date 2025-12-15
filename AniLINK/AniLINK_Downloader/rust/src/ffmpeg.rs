use anyhow::{anyhow, Result};
use console::Term;
use dialoguer::Confirm;
use futures_util::StreamExt;
use indicatif::{ProgressBar, ProgressStyle};
use std::env;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;

pub struct ResolveResult {
    pub path: String,
    pub config_needs_update: bool,
}

pub async fn resolve_path(ffmpeg_path: &str, config_dir: &Path, term: &Term) -> Result<ResolveResult> {
    // Check if system ffmpeg is available
    if ffmpeg_path == "ffmpeg" || ffmpeg_path.is_empty() {
        if Command::new("ffmpeg").arg("-version").stdout(Stdio::null()).stderr(Stdio::null()).status().await.is_ok() {
            return Ok(ResolveResult {
                path: "ffmpeg".to_string(),
                config_needs_update: false,
            });
        }
    } else {
        // Check if provided path exists
        let path = PathBuf::from(ffmpeg_path);
        if path.exists() && path.is_file() {
            return Ok(ResolveResult {
                path: ffmpeg_path.to_string(),
                config_needs_update: false,
            });
        }
    }
    
    // Check if ffmpeg exists in config directory
    let config_ffmpeg = if cfg!(windows) {
        config_dir.join("ffmpeg").join("bin").join("ffmpeg.exe")
    } else {
        config_dir.join("ffmpeg").join("bin").join("ffmpeg")
    };
    
    if config_ffmpeg.exists() {
        return Ok(ResolveResult {
            path: config_ffmpeg.to_string_lossy().to_string(),
            config_needs_update: ffmpeg_path != config_ffmpeg.to_string_lossy(),
        });
    }
    
    // Need to download
    if Confirm::new().with_prompt("ffmpeg not found. Download to config directory?").default(true).interact_on(term)? {
        let downloaded = download(config_dir, term).await?;
        return Ok(ResolveResult {
            path: downloaded.to_string_lossy().to_string(),
            config_needs_update: true,
        });
    }
    
    Err(anyhow!("ffmpeg is required"))
}

async fn download(target_dir: &Path, term: &Term) -> Result<PathBuf> {
    let ffmpeg_bin = if cfg!(windows) {
        target_dir.join("ffmpeg").join("bin").join("ffmpeg.exe")
    } else {
        target_dir.join("ffmpeg").join("bin").join("ffmpeg")
    };

    if ffmpeg_bin.exists() {
        term.write_line("ffmpeg binary found, skipping download.")?;
        return Ok(ffmpeg_bin);
    }

    term.write_line("Downloading ffmpeg...")?;
    let (url, archive_name) = if cfg!(windows) {
        ("https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.7z", "ffmpeg.7z")
    } else {
        ("https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz", "ffmpeg.tar.xz")
    };
    
    fs::create_dir_all(target_dir)?;
    let archive_path = target_dir.join(archive_name);

    if !archive_path.exists() {
        let resp = reqwest::Client::new().get(url).send().await?.error_for_status()?;
        let total = resp.content_length().unwrap_or(0);
        let pb = ProgressBar::new(total);
        pb.set_style(ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {bytes}/{total_bytes} ({bytes_per_sec}) ({eta})")
            .unwrap().progress_chars("█▓▒░-"));

        let tmp_archive_path = archive_path.with_extension(format!("{}{}", archive_path.extension().and_then(|e| e.to_str()).unwrap_or(""), ".tmp"));
        let mut file = File::create(&tmp_archive_path)?;
        let mut stream = resp.bytes_stream();
        let mut downloaded: u64 = 0;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            file.write_all(&chunk)?;
            downloaded += chunk.len() as u64;
            pb.set_position(downloaded);
        }
        fs::rename(&tmp_archive_path, &archive_path)?;
        pb.finish_with_message("Download complete");
    } else {
        term.write_line("Archive found, skipping download.")?;
    }

    if ffmpeg_bin.exists() {
        return Ok(ffmpeg_bin);
    }

    term.write_line("Extracting ffmpeg...")?;
    extract_archive(&archive_path, target_dir, term).await?;

    let extracted = fs::read_dir(target_dir)?
        .filter_map(Result::ok)
        .find(|e| e.path().is_dir() && e.file_name().to_string_lossy().starts_with("ffmpeg-"))
        .map(|e| e.path())
        .ok_or_else(|| anyhow!("Could not find extracted ffmpeg directory"))?;

    let target = target_dir.join("ffmpeg");
    if !target.exists() {
        fs::rename(&extracted, &target)?;
    }

    if target_dir == Path::new(".ffmpeg") {
        let bin_dir = target.join("bin");
        let current_path = env::var("PATH").unwrap_or_default();
        env::set_var("PATH", format!("{};{}", bin_dir.to_str().unwrap(), current_path));
    }

    term.write_line("ffmpeg ready.")?;
    Ok(ffmpeg_bin)
}

async fn extract_archive(archive: &Path, target: &Path, term: &Term) -> Result<()> {
    if cfg!(windows) {
        if Command::new("7z").arg("--help").stdout(Stdio::null()).stderr(Stdio::null()).status().await.is_ok() {
            let status = Command::new("7z").arg("x").arg(archive).arg(format!("-o{}", target.to_str().unwrap())).arg("-y").stdout(Stdio::null()).status().await?;
            if !status.success() { return Err(anyhow!("7z extraction failed")); }
        } else {
            let sevenz_path = target.join("7zr.exe");
            if !sevenz_path.exists() {
                term.write_line("Downloading 7z extractor...")?;
                let mut resp = reqwest::get("https://www.7-zip.org/a/7zr.exe").await?;
                let mut file = File::create(&sevenz_path)?;
                while let Some(chunk) = resp.chunk().await? {
                    file.write_all(&chunk)?;
                }
            }
            let status = Command::new(&sevenz_path).arg("x").arg(archive).arg(format!("-o{}", target.to_str().unwrap())).arg("-y").stdout(Stdio::null()).status().await?;
            if !status.success() { return Err(anyhow!("7z extraction failed")); }
        }
    } else {
        let status = Command::new("tar").arg("-xJf").arg(archive).arg("-C").arg(target).stdout(Stdio::null()).status().await?;
        if !status.success() { return Err(anyhow!("tar extraction failed")); }
    }
    Ok(())
}
