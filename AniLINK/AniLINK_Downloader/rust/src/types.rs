use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("ffmpeg exited with code {0}")]
    FfmpegError(i32),
    #[error("User cancelled operation")]
    UserCancelled,
}

#[derive(Debug, Clone)]
pub struct Subtitle {
    pub name: String,
    pub url: String,
    pub default: bool,
}

#[derive(Debug, Clone)]
pub struct LinkInfo {
    pub id: usize,
    pub name: String,
    pub url: String,
    pub referer: Option<String>,
    pub subtitles: Vec<Subtitle>,
    pub quality: Option<String>,
    pub process_id: Arc<Mutex<Option<u32>>>,
    pub paused: Arc<AtomicBool>,
}

#[derive(Debug, Clone)]
pub struct Settings {
    pub parallel_downloads: usize,
    pub retries: u32,
    pub speed_limit: Option<String>,
    pub timeout: u64,
    pub ffmpeg_path: String,
}

#[derive(Debug, Clone)]
pub enum DownloadStatus {
    Pending,
    Starting,
    Downloading { progress: f64, speed: f64, size_mb: f64 },
    Paused,
    Completed { size_mb: f64 },
    Failed { error: String },
}
