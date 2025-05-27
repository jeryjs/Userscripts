use anyhow::{Context, Result};
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{prelude::*, widgets::*};
use serde::{Deserialize, Serialize};
use std::{
    io::{self},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tokio::{process::Command as TokioCommand, sync::Semaphore, task::JoinHandle};
use regex::Regex;
use unicode_width::UnicodeWidthStr; // Import for width calculation

// --- Constants ---
const APP_NAME: &str = "anilink_downloader"; // Used by confy for dir name
const CONFIG_NAME: &str = "config.toml"; // Used by confy for file name
const DEFAULT_PARALLEL_DOWNLOADS: usize = 4;
const DEFAULT_RETRIES: usize = 3;
const DEFAULT_TIMEOUT_SECONDS: u64 = 60;

// --- Structs and Enums ---

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Settings {
    download_dir: Option<String>,
    ffmpeg_path: Option<String>,
    parallel_downloads: Option<usize>,
    retries: Option<usize>,
    speed_limit: Option<String>, // e.g., "1M" for 1MB/s
    timeout_seconds: Option<u64>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            download_dir: None,
            ffmpeg_path: None, // No default, rely on PATH or user input
            parallel_downloads: Some(DEFAULT_PARALLEL_DOWNLOADS),
            retries: Some(DEFAULT_RETRIES),
            speed_limit: None,
            timeout_seconds: Some(DEFAULT_TIMEOUT_SECONDS),
        }
    }
}

impl Settings {
    fn load() -> Result<Self> {
        confy::load(APP_NAME, Some(CONFIG_NAME)).context("Failed to load config")
    }
    fn save(&self) -> Result<()> {
        confy::store(APP_NAME, Some(CONFIG_NAME), self).context("Failed to save config")
    }
    // Helper getters with defaults
    fn get_parallel_downloads(&self) -> usize {
        self.parallel_downloads.unwrap_or(DEFAULT_PARALLEL_DOWNLOADS)
    }
    fn get_retries(&self) -> usize {
        self.retries.unwrap_or(DEFAULT_RETRIES)
    }
     fn get_timeout(&self) -> Duration {
        Duration::from_secs(self.timeout_seconds.unwrap_or(DEFAULT_TIMEOUT_SECONDS))
    }
    fn get_ffmpeg_cmd(&self) -> &str {
        self.ffmpeg_path.as_deref().unwrap_or("ffmpeg") // Default to "ffmpeg" if not set
    }
}

#[derive(Clone, Debug)]
struct M3uEntry {
    name: String,
    url: String,
}

#[derive(Clone, Debug, PartialEq)]
enum DownloadStatus {
    Pending,
    Downloading(u8), // Old: retry count only
    Progress {
        retry: u8,
        percent: Option<f32>,
        speed: Option<String>,
        eta: Option<String>,
    },
    Completed,
    Failed(String),
    Cancelled,
    Timeout,
}

#[derive(Clone)] // No Debug on JoinHandle
struct DownloadItem {
    entry: M3uEntry,
    status: Arc<Mutex<DownloadStatus>>,
    output_path: PathBuf,
}

#[derive(PartialEq, Eq, Clone, Copy)] // Added derive for comparison
enum AppStateEnum {
    SelectM3u,
    SelectDownloadDir,
    ConfirmOverwrite,
    Downloading,
    Settings,
    Error,
    Finished,
}

// Use a wrapper struct to hold state-specific data if needed
struct AppState {
   current: AppStateEnum,
   // Store data specific to certain states here
   overwrite_files: Vec<PathBuf>, // For ConfirmOverwrite state
   error_message: String, // For Error state
}


#[derive(PartialEq, Eq, Clone, Copy)] // Added derive for comparison
enum InputMode {
    Normal,
    EditingM3u,
    EditingDownloadDir,
    EditingFfmpegPath,
    // Add modes for other settings if they become editable
}

struct App {
    state: AppState,
    settings: Settings,
    m3u_path_input: String,
    download_dir_input: String,
    ffmpeg_path_input: String,
    input_mode: InputMode,
    downloads: Arc<Mutex<Vec<DownloadItem>>>, // Use Arc<Mutex> for shared access
    scroll_offset: usize,
    selected_download_index: usize, // Only relevant in Downloading state
    cancellation_token: Arc<tokio::sync::Notify>, // Use Notify for signalling
    cancel_requested: Arc<AtomicBool>, // Use AtomicBool to check cancellation status easily
    overwrite_confirmed: bool,
    // Store active download handles to ensure they complete or are cleaned up
    download_handles: Arc<Mutex<Vec<JoinHandle<()>>>>,
}

// --- Main Function ---
#[tokio::main]
async fn main() -> Result<()> {
    // Attempt to load settings, use default if fails or not found
    let settings = Settings::load().unwrap_or_default();

    // Ensure download dir exists if specified in loaded settings
    if let Some(dir) = &settings.download_dir {
        let path = PathBuf::from(dir);
        if !path.exists() {
            std::fs::create_dir_all(&path)
                .context(format!("Failed to create download directory specified in config: {}", dir))?;
        }
    }

    let mut app = App::new(settings);

    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let res = run_app(&mut terminal, &mut app).await;

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    // Handle potential errors from run_app
    if let Err(err) = res {
        // Print error clearly after restoring terminal
        eprintln!("
Error: {:?}", err);
        // Attempt to save settings even on error, unless it was a save error itself
        if !err.to_string().contains("Failed to save config") {
             let _ = app.settings.save(); // Ignore save error on exit
        }
        // Exit with non-zero code to indicate error
        std::process::exit(1);
    }

    // Save settings on graceful exit
    app.settings.save().context("Failed to save settings on exit")?;
    Ok(())
}

// --- App Implementation ---
impl App {
    fn new(settings: Settings) -> Self {
        let download_dir_input = settings.download_dir.clone().unwrap_or_default();
        let ffmpeg_path_input = settings.ffmpeg_path.clone().unwrap_or_default();
        App {
            state: AppState { current: AppStateEnum::SelectM3u, overwrite_files: vec![], error_message: String::new() },
            m3u_path_input: String::new(),
            download_dir_input,
            ffmpeg_path_input,
            input_mode: InputMode::Normal,
            settings,
            downloads: Arc::new(Mutex::new(Vec::new())),
            scroll_offset: 0,
            selected_download_index: 0,
            cancellation_token: Arc::new(tokio::sync::Notify::new()),
            cancel_requested: Arc::new(AtomicBool::new(false)),
            overwrite_confirmed: false,
            download_handles: Arc::new(Mutex::new(Vec::new())),
        }
    }

    // Reset state for starting a new download session
    fn reset_for_new_download(&mut self) {
        self.m3u_path_input.clear();
        self.downloads.lock().unwrap().clear();
        self.download_handles.lock().unwrap().clear(); // Clear old handles
        self.scroll_offset = 0;
        self.selected_download_index = 0;
        self.state = AppState { current: AppStateEnum::SelectM3u, overwrite_files: vec![], error_message: String::new() };
        self.cancellation_token = Arc::new(tokio::sync::Notify::new()); // Reset cancellation token
        self.cancel_requested = Arc::new(AtomicBool::new(false)); // Reset flag
        self.overwrite_confirmed = false;
        self.input_mode = InputMode::Normal;
    }

    // Sanitize filenames for Windows compatibility
    fn sanitize_filename(filename: &str) -> String {
        // Remove control characters
        let filename = filename.chars().filter(|c| !c.is_control()).collect::<String>();
        // Replace invalid characters with underscore
        let invalid_chars = Regex::new(r#"[<>:"/\|?*]"#).unwrap();
        let sanitized = invalid_chars.replace_all(&filename, "_").to_string();
        // Trim leading/trailing whitespace/dots
        let sanitized = sanitized.trim_matches(|c: char| c.is_whitespace() || c == '.').to_string();
        // Handle reserved names (case-insensitive on Windows)
        let reserved_names = Regex::new(r"^(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$").unwrap();
        if reserved_names.is_match(&sanitized) || sanitized.is_empty() {
            format!("_{}", sanitized) // Prepend underscore if reserved or empty
        } else {
            sanitized
        }
    }

    // Synchronous function to prepare and trigger the download process
    fn trigger_download_start(&mut self) {
        let m3u_path = self.m3u_path_input.trim();
        if m3u_path.is_empty() {
            self.state = AppState { current: AppStateEnum::Error, error_message: "M3U file path cannot be empty.".to_string(), overwrite_files: vec![] };
            return;
        }

        // Ensure download directory is set and exists
        let download_dir = match self.settings.download_dir.as_deref() {
            Some(dir) if !dir.is_empty() => dir.to_string(),
            _ => {
                self.state = AppState { current: AppStateEnum::Error, error_message: "Download directory is not set.".to_string(), overwrite_files: vec![] };
                return;
            }
        };
        let download_path = PathBuf::from(download_dir);
        if !download_path.exists() {
             if let Err(e) = std::fs::create_dir_all(&download_path) {
                 self.state = AppState { current: AppStateEnum::Error, error_message: format!("Failed to create download directory: {}", e), overwrite_files: vec![] };
                 return;
            }
        }

        // 1. Parse M3U
        let entries = match parse_m3u(m3u_path) {
            Ok(e) if !e.is_empty() => e,
            Ok(_) => {
                self.state = AppState { current: AppStateEnum::Error, error_message: "M3U file is empty or contains no valid entries.".to_string(), overwrite_files: vec![] };
                return;
            }
            Err(err) => {
                self.state = AppState { current: AppStateEnum::Error, error_message: format!("Failed to parse M3U: {}", err), overwrite_files: vec![] };
                return;
            }
        };

        // 2. Prepare Download Items and Check Overwrites
        let mut existing_files = Vec::new();
        let mut prepared_downloads = Vec::new();

        for entry in entries {
            let sanitized_name = Self::sanitize_filename(&entry.name);
            // Guess extension, default to .mp4
            let extension = Path::new(&entry.url)
                .extension()
                .and_then(|os| os.to_str())
                .map(|s| format!(".{}", s.split('?').next().unwrap_or(s))) // Handle query params in URL ext
                .unwrap_or_else(|| ".mp4".to_string());

            let filename = format!("{}{}", sanitized_name, extension);
            let output_path = download_path.join(&filename);

            if output_path.exists() {
                existing_files.push(output_path.clone());
            }

            prepared_downloads.push(DownloadItem {
                entry: entry.clone(),
                status: Arc::new(Mutex::new(DownloadStatus::Pending)),
                output_path,
            });
        }

        // Update the shared download list
        *self.downloads.lock().unwrap() = prepared_downloads;

        // 3. Handle Overwrites
        if !existing_files.is_empty() && !self.overwrite_confirmed {
            self.state = AppState { current: AppStateEnum::ConfirmOverwrite, overwrite_files: existing_files, error_message: String::new() };
            return; // Wait for user confirmation
        }

        // 4. Spawn the Actual Download Task Runner
        self.state = AppState { current: AppStateEnum::Downloading, overwrite_files: vec![], error_message: String::new() };
        let settings = self.settings.clone(); // Clone settings for tasks
        let cancellation_token = self.cancellation_token.clone();
        let cancel_requested = self.cancel_requested.clone();
        let downloads_arc = self.downloads.clone(); // Clone Arc for the task
        let handles_arc = self.download_handles.clone();

        tokio::spawn(async move {
            let semaphore = Arc::new(Semaphore::new(settings.get_parallel_downloads()));
            let max_retries = settings.get_retries();
            let timeout_duration = settings.get_timeout();
            let mut handles = Vec::new();

            let download_items = downloads_arc.lock().unwrap().clone(); // Clone the Vec inside the mutex

            for item in download_items {
                 // Check for immediate cancellation before spawning task
                 if cancel_requested.load(Ordering::SeqCst) {
                     *item.status.lock().unwrap() = DownloadStatus::Cancelled;
                     continue;
                 }

                 let status = Arc::clone(&item.status);
                 let entry = item.entry.clone();
                 let output_path = item.output_path.clone();
                 let settings_clone = settings.clone(); // Clone again for this specific task
                 let semaphore_clone = Arc::clone(&semaphore);
                 let token_clone = Arc::clone(&cancellation_token);
                 let cancel_requested_clone = Arc::clone(&cancel_requested);

                 let handle = tokio::spawn(async move {
                     let permit = match semaphore_clone.acquire().await {
                         Ok(p) => p,
                         Err(_) => {
                             // Semaphore closed, likely during shutdown
                             *status.lock().unwrap() = DownloadStatus::Failed("Semaphore closed".to_string());
                             return;
                         }
                     };

                     let mut current_retry = 0;
                     loop {
                         // Check cancellation before starting/retrying
                         if cancel_requested_clone.load(Ordering::SeqCst) {
                             *status.lock().unwrap() = DownloadStatus::Cancelled;
                             break; // Exit retry loop
                         }

                         *status.lock().unwrap() = DownloadStatus::Downloading(current_retry as u8);

                         let ffmpeg_cmd_path = settings_clone.get_ffmpeg_cmd();
                         let mut cmd = TokioCommand::new(ffmpeg_cmd_path);
                         cmd.arg("-i")
                            .arg(&entry.url)
                            .arg("-c")
                            .arg("copy") // Assumes direct stream copy is desired
                            .arg("-y"); // Overwrite flag for ffmpeg (app handles prompt)

                         // Add optional settings
                         if let Some(speed) = &settings_clone.speed_limit {
                             cmd.arg("-limit_rate").arg(speed);
                         }
                         // Add user agent if needed? Sometimes helps with blocking.
                         // cmd.arg("-user_agent").arg("Mozilla/5.0...");

                         cmd.arg(&output_path);
                         cmd.stdout(Stdio::null()); // Discard stdout
                         cmd.stderr(Stdio::piped()); // Capture stderr for progress

                         let spawn_result = cmd.spawn();

                         let mut child = match spawn_result {
                             Ok(child) => child,
                             Err(e) => {
                                 *status.lock().unwrap() = DownloadStatus::Failed(format!("Spawn failed: {}", e));
                                 break; // Cannot retry if spawn fails
                             }
                         };

                         // Spawn a task to parse ffmpeg progress and update status
                         if let Some(mut stderr) = child.stderr.take() {
                             let status = Arc::clone(&status);
                             let entry_url = entry.url.clone();
                             let output_path = output_path.clone();
                             let retry = current_retry;
                             tokio::spawn(async move {
                                 use tokio::io::{AsyncBufReadExt, BufReader};
                                 let mut reader = BufReader::new(stderr).lines();
                                 let mut last_percent = None;
                                 while let Ok(Some(line)) = reader.next_line().await {
                                     // Example ffmpeg progress line: frame=..., time=00:01:23.45, bitrate=..., speed=1.23x
                                     if line.contains("time=") {
                                         // Try to extract time, speed, etc.
                                         let percent = extract_percent_from_ffmpeg_line(&line, &entry_url, &output_path);
                                         let speed = extract_speed_from_ffmpeg_line(&line);
                                         let eta = extract_eta_from_ffmpeg_line(&line);
                                         *status.lock().unwrap() = DownloadStatus::Progress {
                                             retry,
                                             percent,
                                             speed,
                                             eta,
                                         };
                                         last_percent = percent;
                                     }
                                 }
                             });
                         }

                         let timeout_future = tokio::time::sleep(timeout_duration);
                         let cancelled_future = token_clone.notified(); // Use the cloned token here

                         tokio::select! {
                             // Biased select ensures cancellation is checked first if ready
                             biased;

                             _ = cancelled_future => {
                                 // Kill the process if cancelled via notify
                                 let _ = child.kill().await;
                                 *status.lock().unwrap() = DownloadStatus::Cancelled;
                                 break; // Exit retry loop
                             }

                             _ = timeout_future => {
                                 let _ = child.kill().await; // Kill on timeout
                                 *status.lock().unwrap() = DownloadStatus::Timeout;
                                 // Decide if timeout counts as a retry attempt
                                 if current_retry >= max_retries as u8 {
                                     // Optionally remove partial file on final timeout
                                     // let _ = tokio::fs::remove_file(&output_path).await;
                                     break; // Exit retry loop after max retries
                                 } else {
                                     current_retry += 1;
                                     // Continue to next iteration of the loop for retry
                                 }
                             }

                             result = child.wait() => {
                                 match result {
                                     Ok(exit_status) => {
                                         if exit_status.success() {
                                             *status.lock().unwrap() = DownloadStatus::Completed;
                                             break;
                                         } else {
                                             if current_retry >= max_retries as u8 {
                                                 *status.lock().unwrap() = DownloadStatus::Failed(
                                                     format!("Exit code {:?}", exit_status.code())
                                                 );
                                                 break;
                                             } else {
                                                 current_retry += 1;
                                                 continue;
                                             }
                                         }
                                     }
                                     Err(e) => {
                                         *status.lock().unwrap() = DownloadStatus::Failed(format!("Wait failed: {}", e));
                                         break;
                                     }
                                 }
                             }
                         } // end tokio::select!
                     } // end loop (retries)

                     drop(permit); // Release semaphore permit when task finishes or breaks
                 }); // end tokio::spawn (inner task)
                 handles.push(handle);
            } // end for item in download_items

            // Store the handles in the shared state
            *handles_arc.lock().unwrap() = handles;
        }); // end tokio::spawn (outer task runner)
    }

    // Check if all download tasks have reached a terminal state
    fn check_if_all_downloads_finished(&self) -> bool {
        let downloads = self.downloads.lock().unwrap();
        if downloads.is_empty() && self.state.current == AppStateEnum::Downloading {
            // Handles case where M3U was valid but resulted in 0 download items after filtering/prep
            return true;
        }
        downloads.iter().all(|item| {
            matches!(
                *item.status.lock().unwrap(),
                DownloadStatus::Completed | DownloadStatus::Failed(_) | DownloadStatus::Cancelled | DownloadStatus::Timeout
            )
        })
    }

    // Signal all download tasks to cancel
    fn cancel_all_downloads(&mut self) {
        if !self.cancel_requested.load(Ordering::SeqCst) {
            self.cancel_requested.store(true, Ordering::SeqCst); // Set the flag
            self.cancellation_token.notify_waiters(); // Signal any waiting tasks
            // Also kill any lingering ffmpeg processes system-wide
            #[cfg(target_os = "windows")]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(&["/IM", "ffmpeg.exe", "/F"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = std::process::Command::new("pkill")
                    .arg("ffmpeg")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn();
            }
        }
    }

    // Handle text input for different editing modes
    fn handle_char_input(&mut self, c: char) {
        match self.input_mode {
            InputMode::EditingM3u => self.m3u_path_input.push(c),
            InputMode::EditingDownloadDir => self.download_dir_input.push(c),
            InputMode::EditingFfmpegPath => self.ffmpeg_path_input.push(c),
            InputMode::Normal => {} // Ignore char input in normal mode
        }
    }

    // Handle backspace for different editing modes
    fn handle_backspace(&mut self) {
         match self.input_mode {
            InputMode::EditingM3u => { self.m3u_path_input.pop(); },
            InputMode::EditingDownloadDir => { self.download_dir_input.pop(); },
            InputMode::EditingFfmpegPath => { self.ffmpeg_path_input.pop(); },
            InputMode::Normal => {} // Ignore backspace in normal mode
        }
    }

    // Handle Enter key press, transitioning state or confirming input
    fn handle_enter(&mut self) {
        match self.input_mode {
            InputMode::EditingM3u => {
                self.input_mode = InputMode::Normal;
                // Transition if path seems valid (basic check)
                if !self.m3u_path_input.trim().is_empty() {
                     // If download dir is already set, go to downloads, else ask for dir
                     if self.settings.download_dir.is_some() && !self.settings.download_dir.as_deref().unwrap_or("").is_empty() {
                         self.trigger_download_start();
                     } else {
                         self.state.current = AppStateEnum::SelectDownloadDir;
                     }
                } else {
                    // Stay in SelectM3u state, maybe show error later if needed
                }
            }
            InputMode::EditingDownloadDir => {
                self.input_mode = InputMode::Normal;
                let trimmed_dir = self.download_dir_input.trim();
                if !trimmed_dir.is_empty() {
                    self.settings.download_dir = Some(trimmed_dir.to_string());
                    // Now start downloads since M3U path should already be set
                    self.trigger_download_start();
                } else {
                   // Stay in SelectDownloadDir state, maybe show error
                   self.settings.download_dir = None; // Clear setting if input is empty
                }
            }
            InputMode::EditingFfmpegPath => {
                self.input_mode = InputMode::Normal;
                // Update setting immediately (will be saved on 's' or exit)
                let trimmed_path = self.ffmpeg_path_input.trim();
                 if trimmed_path.is_empty() {
                    self.settings.ffmpeg_path = None;
                 } else {
                    self.settings.ffmpeg_path = Some(trimmed_path.to_string());
                 }
            }
            InputMode::Normal => { // Handle Enter in Normal mode
                match self.state.current {
                    AppStateEnum::SelectM3u => { // Try to proceed if path already entered
                         if !self.m3u_path_input.trim().is_empty() {
                             if self.settings.download_dir.is_some() && !self.settings.download_dir.as_deref().unwrap_or("").is_empty() {
                                 self.trigger_download_start();
                             } else {
                                 self.state.current = AppStateEnum::SelectDownloadDir;
                             }
                         } else {
                             self.input_mode = InputMode::EditingM3u; // Enter editing if empty
                         }
                    }
                    AppStateEnum::SelectDownloadDir => { // Try to proceed if path already entered
                         let trimmed_dir = self.download_dir_input.trim();
                         if !trimmed_dir.is_empty() {
                             self.settings.download_dir = Some(trimmed_dir.to_string());
                             self.trigger_download_start();
                         } else {
                             self.input_mode = InputMode::EditingDownloadDir; // Enter editing if empty
                         }
                    }
                    AppStateEnum::Error => self.reset_for_new_download(), // Acknowledge error
                    AppStateEnum::Finished => self.reset_for_new_download(), // Acknowledge finish
                    _ => {} // No action for Enter in Normal mode for other states
                }
            }
        }
    }

    // Handle Esc key press, typically cancelling edits or going back
    fn handle_esc(&mut self) {
         match self.input_mode {
            InputMode::EditingM3u | InputMode::EditingDownloadDir | InputMode::EditingFfmpegPath => {
                // Revert input fields to match current settings/state on Esc
                match self.input_mode {
                    InputMode::EditingM3u => {} // M3U path is transient, don't revert
                    InputMode::EditingDownloadDir => self.download_dir_input = self.settings.download_dir.clone().unwrap_or_default(),
                    InputMode::EditingFfmpegPath => self.ffmpeg_path_input = self.settings.ffmpeg_path.clone().unwrap_or_default(),
                    _ => {}
                }
                self.input_mode = InputMode::Normal;
            }
            InputMode::Normal => { // Handle Esc in Normal mode
                match self.state.current {
                    AppStateEnum::SelectDownloadDir => self.state.current = AppStateEnum::SelectM3u, // Go back
                    AppStateEnum::Settings => {
                        // Revert potentially unsaved changes shown in input fields
                        self.ffmpeg_path_input = self.settings.ffmpeg_path.clone().unwrap_or_default();
                        // Revert other setting inputs here...
                        self.state.current = AppStateEnum::SelectM3u; // Go back to start
                    }
                    AppStateEnum::ConfirmOverwrite => self.reset_for_new_download(), // Cancel overwrite/download
                    AppStateEnum::Error => self.reset_for_new_download(), // Acknowledge error
                    AppStateEnum::Finished => self.reset_for_new_download(), // Acknowledge finish
                    _ => {} // No action for Esc in Normal mode for SelectM3u, Downloading
                }
            }
        }
    }

    // Handle 's' key for saving settings or switching to settings view
    fn handle_s_key(&mut self) {
        match self.state.current {
            AppStateEnum::Settings => { // Save settings
                // Update settings from input fields before saving
                let trimmed_ffmpeg = self.ffmpeg_path_input.trim();
                self.settings.ffmpeg_path = if trimmed_ffmpeg.is_empty() { None } else { Some(trimmed_ffmpeg.to_string()) };
                // Update other settings from their input fields here...

                if let Err(e) = self.settings.save() {
                    // Go to error state, preserving the settings view potentially
                    self.state = AppState { current: AppStateEnum::Error, error_message: format!("Failed to save settings: {}", e), overwrite_files: vec![] };
                } else {
                   // Optionally show a success message briefly? Or just go back.
                   self.state.current = AppStateEnum::SelectM3u; // Go back to start after saving
                   self.input_mode = InputMode::Normal;
                }
            }
            // Go to settings view from other states (if not editing)
            AppStateEnum::SelectM3u | AppStateEnum::SelectDownloadDir if self.input_mode == InputMode::Normal => {
                // Ensure input fields reflect current settings before showing
                self.download_dir_input = self.settings.download_dir.clone().unwrap_or_default();
                self.ffmpeg_path_input = self.settings.ffmpeg_path.clone().unwrap_or_default();
                // Update other input fields...
                self.state.current = AppStateEnum::Settings;
            }
            _ => {} // Ignore 's' in other states/modes
        }
    }

     // Handle 'e' key for entering edit mode
    fn handle_e_key(&mut self) {
        if self.input_mode != InputMode::Normal { return; } // Only enter edit from normal mode

        match self.state.current {
            AppStateEnum::SelectM3u => self.input_mode = InputMode::EditingM3u,
            AppStateEnum::SelectDownloadDir => self.input_mode = InputMode::EditingDownloadDir,
            AppStateEnum::Settings => self.input_mode = InputMode::EditingFfmpegPath, // Default to editing ffmpeg path
            _ => {} // No edit action in other states
        }
    }

    // Handle Up/Down arrow keys for list navigation
    fn handle_arrow_keys(&mut self, code: KeyCode) {
        let downloads = self.downloads.lock().unwrap();
        if self.state.current != AppStateEnum::Downloading || downloads.is_empty() {
            return; // Only applicable in downloading state with items
        }

        let len = downloads.len();
        match code {
            KeyCode::Down => {
                self.selected_download_index = (self.selected_download_index + 1) % len;
            }
            KeyCode::Up => {
                self.selected_download_index = if self.selected_download_index == 0 {
                    len - 1
                } else {
                    self.selected_download_index - 1
                };
            }
            _ => {}
        }
        // Scroll offset adjustment happens in render_download_list
    }
}


// --- Event Loop ---
async fn run_app(terminal: &mut Terminal<impl Backend>, app: &mut App) -> Result<()> {
    let mut last_tick = Instant::now();
    let tick_rate = Duration::from_millis(100); // Faster tick rate for smoother UI updates

    loop {
        // Draw UI
        terminal.draw(|f| ui(f, app))?;

        // Check for state transitions triggered by async operations
        if app.state.current == AppStateEnum::Downloading && app.check_if_all_downloads_finished() {
             // Ensure all task handles are awaited or finished before changing state
             // This might require more complex logic if tasks can error out early
             // For simplicity, we assume check_if_all_downloads_finished is sufficient
             app.state.current = AppStateEnum::Finished;
             app.input_mode = InputMode::Normal; // Ensure normal mode on finish
        }

        // Event handling timeout calculation
        let timeout = tick_rate
            .checked_sub(last_tick.elapsed())
            .unwrap_or_else(|| Duration::from_secs(0));

        // Poll for terminal events
        if crossterm::event::poll(timeout)? {
            if let Event::Key(key) = event::read()? {
                // Global Quit (Ctrl+C or 'q' in non-editing modes)
                if key.modifiers == KeyModifiers::CONTROL && key.code == KeyCode::Char('c') {
                    if app.state.current == AppStateEnum::Downloading {
                        app.cancel_all_downloads();
                        // State will change to Finished once tasks acknowledge cancellation & finish
                    } else {
                        return Ok(()); // Quit immediately from other states
                    }
                }
                // Handle key presses only
                else if key.kind == KeyEventKind::Press {
                    match app.input_mode {
                        // --- Editing Mode Key Handling ---
                        InputMode::EditingM3u | InputMode::EditingDownloadDir | InputMode::EditingFfmpegPath => {
                            match key.code {
                                KeyCode::Enter => app.handle_enter(),
                                KeyCode::Char(c) => app.handle_char_input(c),
                                KeyCode::Backspace => app.handle_backspace(),
                                KeyCode::Esc => app.handle_esc(),
                                _ => {} // Ignore other keys in edit mode
                            }
                        }
                        // --- Normal Mode Key Handling ---
                        InputMode::Normal => {
                            match app.state.current {
                                AppStateEnum::ConfirmOverwrite => match key.code {
                                    KeyCode::Char('y') | KeyCode::Char('Y') => {
                                        app.overwrite_confirmed = true;
                                        app.trigger_download_start(); // Start downloads now
                                    }
                                    KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                                        app.reset_for_new_download(); // Cancel
                                    }
                                    _ => {}
                                },
                                AppStateEnum::Downloading => match key.code {
                                    KeyCode::Char('c') => app.cancel_all_downloads(),
                                    KeyCode::Char('q') => {
                                        app.cancel_all_downloads();
                                        // Don't return immediately, let tasks finish/cancel
                                    }
                                    KeyCode::Up | KeyCode::Down => app.handle_arrow_keys(key.code),
                                    _ => {}
                                },
                                AppStateEnum::Finished => match key.code {
                                     KeyCode::Char('r') => app.reset_for_new_download(),
                                     KeyCode::Char('q') => return Ok(()),
                                     KeyCode::Enter | KeyCode::Esc => app.reset_for_new_download(), // Treat as acknowledge
                                     _ => {}
                                },
                                AppStateEnum::Error => match key.code {
                                    KeyCode::Enter | KeyCode::Esc | KeyCode::Char('q') => {
                                        app.reset_for_new_download(); // Acknowledge error
                                    }
                                    _ => {}
                                },
                                // Key handling for SelectM3u, SelectDownloadDir, Settings in Normal mode
                                _ => match key.code {
                                    KeyCode::Char('q') => return Ok(()),
                                    KeyCode::Char('e') => app.handle_e_key(),
                                    KeyCode::Char('s') => app.handle_s_key(),
                                    KeyCode::Enter => app.handle_enter(),
                                    KeyCode::Esc => app.handle_esc(),
                                    _ => {}
                                },
                            }
                        }
                    }
                } // end key.kind == Press
            } // end Event::Key
        } // end crossterm::event::poll

        // Tick update (if needed for animations or timed events)
        if last_tick.elapsed() >= tick_rate {
            // app.on_tick(); // Placeholder for any tick-based logic
            last_tick = Instant::now();
        }

        // Check if cancellation was requested and all tasks are done (for graceful exit)
        if app.cancel_requested.load(Ordering::SeqCst) && app.check_if_all_downloads_finished() {
            // Ensure all handles are joined/finished before exiting?
            // This might block the UI thread if not handled carefully.
            // For now, assume check_if_all_downloads_finished is enough.
            return Ok(()); // Exit loop after cancellation is complete
        }
    } // end loop
}


// --- UI Rendering Functions ---

// Main UI dispatcher
fn ui(f: &mut Frame, app: &mut App) { // Removed <B: Backend>
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(
            [
                Constraint::Length(3), // Title bar
                Constraint::Min(1),    // Main content area
                Constraint::Length(3), // Controls help bar
            ]
            .as_ref(),
        )
        .split(f.size());

    // --- Title Bar ---
    let title_block = Block::default().borders(Borders::ALL).title(" AniLINK Downloader ".bold());
    f.render_widget(title_block, chunks[0]);

    // --- Main Content Area ---
    let main_area = chunks[1];
    match app.state.current {
        AppStateEnum::SelectM3u => render_input_prompt(f, main_area, app, "M3U File Path:", &app.m3u_path_input, InputMode::EditingM3u),
        AppStateEnum::SelectDownloadDir => render_input_prompt(f, main_area, app, "Download Directory:", &app.download_dir_input, InputMode::EditingDownloadDir),
        AppStateEnum::Downloading => render_download_list(f, main_area, app),
        AppStateEnum::Settings => render_settings(f, main_area, app),
        AppStateEnum::ConfirmOverwrite => render_confirm_overwrite(f, main_area, &app.state.overwrite_files),
        AppStateEnum::Error => render_message(f, main_area, "Error", &app.state.error_message, Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)),
        AppStateEnum::Finished => render_message(f, main_area, "Finished", "All tasks complete. Press [R] to restart or [Q] to quit.", Style::default().fg(Color::Green)),
    }

    // --- Controls Bar ---
    render_controls(f, chunks[2], app);
}

// Renders a text input field
fn render_input_prompt(f: &mut Frame, area: Rect, app: &App, prompt: &str, input_text: &str, editing_mode: InputMode) {
    let block = Block::default().borders(Borders::ALL).title(prompt);
    let is_editing_this = app.input_mode == editing_mode;

    let paragraph = Paragraph::new(input_text)
        .block(block)
        .style(if is_editing_this {
            Style::default().fg(Color::Yellow) // Highlight when editing this field
        } else {
            Style::default()
        });
    f.render_widget(paragraph, area);

    // Show cursor only when editing this specific field
    if is_editing_this {
        f.set_cursor(
            area.x + input_text.width() as u16 + 1, // Position cursor after text (using unicode-width)
            area.y + 1, // Inside the block border (Y=1)
        )
    }
}

// Renders the list of downloads with status and selection
fn render_download_list(f: &mut Frame, area: Rect, app: &mut App) {
    let block = Block::default().borders(Borders::ALL).title("Downloads");
    let list_area = block.inner(area); // Area inside the block borders
    f.render_widget(block, area);

    let downloads = app.downloads.lock().unwrap(); // Lock the mutex to access downloads

    if downloads.is_empty() {
        let center_text = Paragraph::new("Parsing M3U or waiting for downloads to start...")
            .alignment(Alignment::Center);
        f.render_widget(center_text, list_area);
        return;
    }

    let list_height = list_area.height as usize;
    if list_height == 0 { return; } // Avoid panic if area is too small

    // Adjust scroll offset to keep the selected item visible
    if app.selected_download_index < app.scroll_offset {
        app.scroll_offset = app.selected_download_index;
    } else if app.selected_download_index >= app.scroll_offset + list_height {
        app.scroll_offset = app.selected_download_index.saturating_sub(list_height) + 1;
    }
    // Ensure scroll offset doesn't go beyond possible items
    app.scroll_offset = app.scroll_offset.min(downloads.len().saturating_sub(list_height));


    let items: Vec<ListItem> = downloads
        .iter()
        .enumerate()
        .skip(app.scroll_offset) // Apply scrolling
        .take(list_height)      // Take only visible items
        .map(|(original_index_in_view, item)| { // Index relative to view start + offset = original index
            let original_index = original_index_in_view + app.scroll_offset;
            let status_lock = item.status.lock().unwrap(); // Lock once per item
            let status_text = match &*status_lock {
                DownloadStatus::Pending => "Pending".fg(Color::DarkGray),
                DownloadStatus::Downloading(retry) => format!("Downloading (Retry {})...", retry).fg(Color::Cyan),
                DownloadStatus::Progress { percent, speed, eta, retry } => {
                    let percent_str = percent.map(|p| format!("{:.1}%", p)).unwrap_or_else(|| "??".to_string());
                    let speed_str = speed.clone().unwrap_or_else(|| "??".to_string());
                    let eta_str = eta.clone().unwrap_or_else(|| "??".to_string());
                    format!("{} - Speed: {} - ETA: {}", percent_str, speed_str, eta_str).fg(Color::Green)
                },
                DownloadStatus::Completed => "Completed".fg(Color::Green),
                DownloadStatus::Failed(e) => format!("Failed: {}", e.chars().take(30).collect::<String>()).fg(Color::Red), // Truncate error
                DownloadStatus::Cancelled => "Cancelled".fg(Color::Yellow),
                DownloadStatus::Timeout => "Timeout".fg(Color::Magenta),
            };
            drop(status_lock); // Release lock explicitly

            // Truncate filename display if needed
            let progress_width = 36; // Ample space for progress bar and info
            let min_name_width = 12;
            let max_name_width = list_area.width.saturating_sub(progress_width as u16).max(min_name_width as u16) as usize;
            let display_name = if item.entry.name.width() > max_name_width {
                 format!("{}...", item.entry.name.chars().take(max_name_width.saturating_sub(3)).collect::<String>())
            } else {
                 item.entry.name.clone()
            };

            let line = Line::from(vec![
                Span::raw(format!("{:<width$}", display_name, width = max_name_width)),
                Span::raw(" "), // Separator
                status_text,
            ]);

            // Style based on selection relative to the original index
            let style = if original_index == app.selected_download_index {
                Style::default().add_modifier(Modifier::REVERSED) // Highlight selected item
            } else {
                Style::default()
            };
            ListItem::new(line).style(style)
        })
        .collect();

    let list = List::new(items);
        // .highlight_style(Style::default().add_modifier(Modifier::REVERSED)) // Style already applied in map
        // .highlight_symbol("> "); // Symbol for the selected line (implicit with reversed style)

    f.render_widget(list, list_area); // Render the list in the inner area
}


// Renders the settings view
fn render_settings(f: &mut Frame, area: Rect, app: &mut App) {
     let block = Block::default().borders(Borders::ALL).title("Settings");
     f.render_widget(&block, area);

     // Use layout to position settings items vertically
     let constraints = [
         Constraint::Length(3), // FFMPEG Path (Label + Input)
         Constraint::Length(1), // Parallel Downloads (Display only)
         Constraint::Length(1), // Retries (Display only)
         Constraint::Length(1), // Timeout (Display only)
         Constraint::Length(1), // Speed Limit (Display only)
         Constraint::Min(0), // Spacer at the bottom
     ];
     let chunks = Layout::default()
         .direction(Direction::Vertical)
         .margin(1) // Margin inside the block
         .constraints(constraints)
         .split(block.inner(area)); // Split the inner area

     // --- FFMPEG Path ---
     render_input_prompt(f, chunks[0], app, "FFmpeg Path (leave blank to use PATH):", &app.ffmpeg_path_input, InputMode::EditingFfmpegPath);

     // --- Display Other Settings (Read-only for now) ---
     let parallel_text = format!("Parallel Downloads: {}", app.settings.get_parallel_downloads());
     f.render_widget(Paragraph::new(parallel_text), chunks[1]);

     let retries_text = format!("Max Retries: {}", app.settings.get_retries());
     f.render_widget(Paragraph::new(retries_text), chunks[2]);

     let timeout_text = format!("Timeout per File: {} seconds", app.settings.get_timeout().as_secs());
     f.render_widget(Paragraph::new(timeout_text), chunks[3]);

     let speed_limit_text = format!("Speed Limit: {}", app.settings.speed_limit.as_deref().unwrap_or("None"));
     f.render_widget(Paragraph::new(speed_limit_text), chunks[4]);

     // TODO: Add input widgets and corresponding InputModes if these settings become editable.
}

// Renders the confirmation prompt for overwriting files
fn render_confirm_overwrite(f: &mut Frame, area: Rect, files: &[PathBuf]) {
    let file_list_limit = (area.height as usize).saturating_sub(6); // Estimate lines needed for text/prompt

    let mut text_lines = vec![
        Line::from("The following files already exist:".bold()),
        Line::from(""),
    ];

    // Add filenames, respecting the display limit
    text_lines.extend(
        files.iter()
             .take(file_list_limit)
             .map(|p| Line::from(format!("  - {}", p.file_name().map_or_else(|| p.display().to_string(), |os| os.to_string_lossy().into_owned())))) // Show only filename
    );

    let remaining_count = files.len().saturating_sub(file_list_limit);
    if remaining_count > 0 {
         text_lines.push(Line::from(format!("  ...and {} more", remaining_count)));
    }

    text_lines.push(Line::from(""));
    text_lines.push(Line::from("Overwrite existing files? (Y/N)".bold()));

    let block = Block::default().borders(Borders::ALL).title("Confirm Overwrite");
    let paragraph = Paragraph::new(text_lines)
        .block(block)
        .alignment(Alignment::Center)
        .wrap(Wrap { trim: true }); // Wrap long filenames if necessary

    f.render_widget(paragraph, area);
}

// Renders a generic message (used for Error and Finished states)
fn render_message(f: &mut Frame, area: Rect, title: &str, message: &str, style: Style) {
    let block = Block::default().borders(Borders::ALL).title(title);
    let paragraph = Paragraph::new(message)
        .block(block)
        .style(style)
        .alignment(Alignment::Center)
        .wrap(Wrap { trim: true });
    f.render_widget(paragraph, area);
}

// Renders the dynamic controls help bar at the bottom
fn render_controls(f: &mut Frame, area: Rect, app: &App) {
    let controls_text: String = match app.input_mode { // Added type annotation
        // --- Editing Mode Controls ---
        InputMode::EditingM3u | InputMode::EditingDownloadDir | InputMode::EditingFfmpegPath => {
            "[Enter] Confirm | [Esc] Cancel Edit".into()
        }
        // --- Normal Mode Controls ---
        InputMode::Normal => match app.state.current {
            AppStateEnum::SelectM3u => "[E] Edit Path | [S] Settings | [Enter] Next/Start | [Q] Quit | [Ctrl+C] Quit".into(),
            AppStateEnum::SelectDownloadDir => "[E] Edit Path | [S] Settings | [Enter] Start | [Esc] Back | [Q] Quit | [Ctrl+C] Quit".into(),
            AppStateEnum::Downloading => "[C] Cancel All | [↑/↓] Navigate | [Q] Quit & Cancel | [Ctrl+C] Quit & Cancel".into(),
            AppStateEnum::Settings => "[E] Edit FFMpeg Path | [S] Save Settings | [Esc] Back | [Q] Quit | [Ctrl+C] Quit".into(), // Add keys for other editable settings
            AppStateEnum::ConfirmOverwrite => "[Y] Yes | [N] No / Cancel | [Ctrl+C] Quit".into(),
            AppStateEnum::Error => "[Enter/Esc/Q] Acknowledge & Restart | [Ctrl+C] Quit".into(),
            AppStateEnum::Finished => "[R] Restart | [Q] Quit | [Enter/Esc] Restart | [Ctrl+C] Quit".into(),
        },
    };

    let block = Block::default().borders(Borders::ALL).title("Controls");
    let paragraph = Paragraph::new(controls_text)
        .block(block)
        .alignment(Alignment::Center);
    f.render_widget(paragraph, area);
}


// --- M3U Parsing Logic ---
fn parse_m3u(path: &str) -> Result<Vec<M3uEntry>> {
    let content = std::fs::read_to_string(path).context(format!("Failed to read M3U file: {}", path))?;
    let mut entries = Vec::new();
    let mut current_name: Option<String> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || (line.starts_with('#') && !line.starts_with("#EXTINF")) {
            continue; // Skip comments (except EXTINF) and empty lines
        }

        if line.starts_with("#EXTINF") {
            // Format: #EXTINF:duration [attribute=value ...],Track Title
            // Extract the title part after the last comma
            current_name = line.rsplitn(2, ',').next().map(|s| s.trim().to_string());
        } else if !line.starts_with('#') { // Assume it's a URL if not a comment
            let name = current_name.take().unwrap_or_else(|| {
                // Generate a name from URL if EXTINF was missing or malformed
                Path::new(line)
                    .file_stem() // Get filename without extension
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string())
                    .filter(|s| !s.is_empty()) // Ensure generated name is not empty
                    .unwrap_or_else(|| format!("Track_{}", entries.len() + 1)) // Fallback name
            });
            // Basic URL validation could be added here if needed
            if line.contains("://") { // Simple check for a protocol
                 entries.push(M3uEntry { name, url: line.to_string() });
            } else {
                // Optionally log or handle invalid-looking URLs
            }
            current_name = None; // Reset name after using it for a URL
        }
    }
    if entries.is_empty() && !content.is_empty() {
         // File had content but no valid entries found
         // You could return an error here if desired:
         // anyhow::bail!("M3U file contained no valid #EXTINF/URL pairs.");
    }
    Ok(entries)
}

// --- FFmpeg Progress Parsing Helpers ---
fn extract_percent_from_ffmpeg_line(line: &str, _url: &str, _output_path: &std::path::Path) -> Option<f32> {
    // Try to extract time= and estimate percent (very basic, real percent needs duration)
    // Example: ... time=00:01:23.45 ...
    if let Some(time_str) = line.split_whitespace().find_map(|s| s.strip_prefix("time=")) {
        // Parse time as seconds
        let secs = parse_ffmpeg_time_to_seconds(time_str);
        // TODO: To get percent, need total duration. For now, just return None.
        // If you want to parse duration, you can use ffprobe or parse EXTINF from M3U.
        return None;
    }
    None
}
fn extract_speed_from_ffmpeg_line(line: &str) -> Option<String> {
    // Example: ... speed=1.23x ...
    line.split_whitespace()
        .find_map(|s| s.strip_prefix("speed=").map(|v| v.to_string()))
}
fn extract_eta_from_ffmpeg_line(_line: &str) -> Option<String> {
    // Not directly available from ffmpeg, would need to estimate
    None
}
fn parse_ffmpeg_time_to_seconds(time_str: &str) -> f32 {
    // Format: HH:MM:SS.xx
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() == 3 {
        let h: f32 = parts[0].parse().unwrap_or(0.0);
        let m: f32 = parts[1].parse().unwrap_or(0.0);
        let s: f32 = parts[2].parse().unwrap_or(0.0);
        h * 3600.0 + m * 60.0 + s
    } else {
        0.0
    }
}
