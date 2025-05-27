use crate::config::Config;
use crate::m3u::{Episode, get_file_extension, sanitize_filename};
use anyhow::Result;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Debug, PartialEq, Eq)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Completed,
    Failed(String),
    Cancelled,
}

pub struct Download {
    pub episode: Episode,
    pub status: DownloadStatus,
    pub progress: f64,
    pub file_size: u64,
    pub duration: f64,
    pub elapsed_time: f64,
    pub remaining_time: f64,
    pub output_path: PathBuf,
    pub process: Option<Child>,
    pub start_time: Option<Instant>,
}

impl Download {
    pub fn new(episode: Episode, folder: PathBuf) -> Self {
        let file_name = sanitize_filename(&episode.name);
        let ext = get_file_extension(&episode.url);
        let output_path = folder.join(format!("{}.{}", file_name, ext.trim_start_match('.')));

        Self {
            episode,
            status: DownloadStatus::Queued,
            progress: 0.0,
            file_size: 0,
            duration: 0.0,
            elapsed_time: 0.0,
            remaining_time: 0.0,
            output_path,
            process: None,
            start_time: None,
        }
    }

    pub fn start(&mut self, config: &Config) -> Result<()> {
        let mut command = Command::new("ffmpeg");
        command
            .arg("-y")
            .arg("-progress")
            .arg("pipe:1")
            .arg("-i")
            .arg(&self.episode.url)
            .arg("-c")
            .arg("copy");

        if let Some(limit) = &config.speed_limit {
            command.arg("-maxrate").arg(limit);
        }

        command.arg(&self.output_path);

        // Setup pipes for monitoring progress
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());

        let process = command.spawn()?;
        self.process = Some(process);
        self.status = DownloadStatus::Downloading;
        self.start_time = Some(Instant::now());

        Ok(())
    }

    pub fn update_progress(&mut self) {
        if self.status != DownloadStatus::Downloading {
            return;
        }

        if let Some(process) = &mut self.process {
            match process.try_wait() {
                Ok(Some(status)) => {
                    // Process completed
                    if status.success() {
                        self.status = DownloadStatus::Completed;
                        self.progress = 100.0;
                    } else {
                        self.status = DownloadStatus::Failed(format!("Exit code: {}", status.code().unwrap_or(-1)));
                    }
                    self.process = None;
                }
                Ok(None) => {
                    // Process still running, try to get progress info
                    if let Some(start_time) = self.start_time {
                        self.elapsed_time = start_time.elapsed().as_secs_f64();
                        
                        // For demonstration, simulate progress
                        // In a real implementation, you'd parse ffmpeg output
                        if self.duration == 0.0 {
                            self.duration = 100.0; // Placeholder
                        }
                        
                        // Simple simulation: progress increases over time
                        self.progress = (self.elapsed_time / self.duration * 100.0).min(99.0);
                        
                        if self.progress > 0.0 {
                            let speed = self.progress / self.elapsed_time;
                            self.remaining_time = (100.0 - self.progress) / speed;
                        }
                        
                        // Update file size if file exists
                        if let Ok(metadata) = std::fs::metadata(&self.output_path) {
                            self.file_size = metadata.len();
                        }
                    }
                }
                Err(e) => {
                    self.status = DownloadStatus::Failed(format!("Error checking process: {}", e));
                    self.process = None;
                }
            }
        }
    }

    pub fn toggle_pause(&mut self) -> Result<()> {
        match self.status {
            DownloadStatus::Downloading => {
                // Pause the download
                if let Some(process) = &mut self.process {
                    // In a real implementation, we might use a signal to pause ffmpeg
                    // For this example, we'll just terminate and mark as paused
                    let _ = process.kill();
                    self.process = None;
                    self.status = DownloadStatus::Paused;
                }
            }
            DownloadStatus::Paused => {
                // Resume the download
                self.start_time = Some(Instant::now());
                self.status = DownloadStatus::Queued; // Will be picked up and restarted
            }
            _ => {}
        }
        Ok(())
    }

    pub fn cancel(&mut self) -> Result<()> {
        if let Some(process) = &mut self.process {
            let _ = process.kill();
            self.process = None;
        }
        self.status = DownloadStatus::Cancelled;
        Ok(())
    }
}

// Helper extension trait
trait StrExt {
    fn trim_start_match(&self, c: char) -> &str;
}

impl StrExt for str {
    fn trim_start_match(&self, c: char) -> &str {
        if self.starts_with(c) {
            &self[1..]
        } else {
            self
        }
    }
}
