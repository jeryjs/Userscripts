use anyhow::Result;
use parking_lot::Mutex;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader as AsyncBufReader};
use tokio::process::Command;
use std::process::Stdio;
use std::path::PathBuf;
use std::fs;
use crate::types::{LinkInfo, Settings, DownloadStatus};
use crate::parser::{parse_ffmpeg_duration, parse_ffmpeg_time};
use crate::utils::get_output_file;

pub async fn download_stream(
    link_info: LinkInfo,
    folder: PathBuf,
    settings: Settings,
    all_links: Vec<LinkInfo>,
    shared_state: Arc<Mutex<Vec<(LinkInfo, DownloadStatus)>>>,
    link_id: usize,
) -> Result<()> {
    let output_file = get_output_file(&link_info, &folder, &all_links);

    // Set status to Starting
    {
        let mut downloads = shared_state.lock();
        if let Some(pos) = downloads.iter().position(|(li, _)| li.id == link_id) {
            downloads[pos].1 = DownloadStatus::Starting;
        }
    }

    for attempt in 1..=settings.retries {
        let mut cmd = Command::new(&settings.ffmpeg_path);
        cmd.arg("-y").arg("-progress").arg("pipe:1");

        if let Some(referer) = &link_info.referer {
            cmd.arg("-headers").arg(format!("Referer: {}\r\n", referer));
        }

        cmd.arg("-i").arg(&link_info.url);

        for sub in &link_info.subtitles {
            cmd.arg("-i").arg(&sub.url);
        }

        cmd.arg("-c").arg("copy");

        for (i, sub) in link_info.subtitles.iter().enumerate() {
            let lang = sub.name.chars().take(3).collect::<String>().to_lowercase();
            cmd.arg(format!("-metadata:s:s:{}", i)).arg(format!("language={}", lang));
            cmd.arg(format!("-metadata:s:s:{}", i)).arg(format!("title={}", sub.name));
            if sub.default {
                cmd.arg(format!("-disposition:s:{}", i)).arg("default");
            }
        }

        cmd.arg("-metadata").arg(format!("title={}", link_info.name));

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

        while let Some(line) = reader.next_line().await? {
            // Check if paused and update status
            if link_info.paused.load(std::sync::atomic::Ordering::SeqCst) {
                let mut downloads = shared_state.lock();
                if let Some(pos) = downloads.iter().position(|(li, _)| li.id == link_id) {
                    if !matches!(downloads[pos].1, DownloadStatus::Paused) {
                        downloads[pos].1 = DownloadStatus::Paused;
                    }
                }
                drop(downloads);
            }

            if line.contains("Duration") {
                duration = parse_ffmpeg_duration(&line).or(duration);
            } else if line.contains("time=") && duration.is_some() {
                if let Some(current_time) = parse_ffmpeg_time(&line) {
                    let total_duration = duration.unwrap();
                    let progress = (current_time / total_duration * 100.0).min(100.0);
                    let elapsed = start_time.elapsed().as_secs_f64();
                    let speed = if elapsed > 0.0 { current_time / elapsed } else { 0.0 };
                    let size_mb = fs::metadata(&output_file).map(|m| m.len() as f64 / 1_048_576.0).unwrap_or(0.0);

                    // Update shared state only if not paused
                    if !link_info.paused.load(std::sync::atomic::Ordering::SeqCst) {
                        let mut downloads = shared_state.lock();
                        if let Some(pos) = downloads.iter().position(|(li, _)| li.id == link_id) {
                            downloads[pos].1 = DownloadStatus::Downloading { progress, speed, size_mb };
                        }
                    }
                }
            }
        }

        let exit_status = child.wait().await?;

        if exit_status.success() {
            let size_mb = fs::metadata(&output_file)?.len() as f64 / 1_048_576.0;
            
            // Update shared state to completed
            let mut downloads = shared_state.lock();
            if let Some(pos) = downloads.iter().position(|(li, _)| li.id == link_id) {
                downloads[pos].1 = DownloadStatus::Completed { size_mb };
            }
            
            return Ok(());
        } else if attempt == settings.retries {
            // Update shared state to failed
            let mut downloads = shared_state.lock();
            if let Some(pos) = downloads.iter().position(|(li, _)| li.id == link_id) {
                downloads[pos].1 = DownloadStatus::Failed {
                    error: format!("ffmpeg exited with code {}", exit_status.code().unwrap_or(-1)),
                };
            }
            
            return Err(anyhow::anyhow!("Download failed after {} retries", settings.retries));
        } else {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
    }

    Ok(())
}
