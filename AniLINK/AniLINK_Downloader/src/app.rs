use crate::config::Config;
use crate::downloader::{Download, DownloadStatus};
use crate::m3u::Episode;
use anyhow::Result;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use std::path::PathBuf;

pub enum AppState {
    Welcome,
    FileSelection,
    FolderSelection,
    EpisodeSelection,
    Downloading,
    Settings,
}

pub struct App {
    pub state: AppState,
    pub m3u_path: Option<String>,
    pub download_folder: Option<PathBuf>,
    pub input_buffer: String,
    pub episodes: Vec<Episode>,
    pub selected_episode_idx: Option<usize>,
    pub episode_selections: Vec<bool>,
    pub downloads: Vec<Download>,
    pub selected_download_idx: Option<usize>,
    pub config: Config,
    pub show_help: bool,
}

impl App {
    pub fn new() -> Self {
        Self {
            state: AppState::Welcome,
            m3u_path: None,
            download_folder: None,
            input_buffer: String::new(),
            episodes: Vec::new(),
            selected_episode_idx: Some(0),
            episode_selections: Vec::new(),
            downloads: Vec::new(),
            selected_download_idx: Some(0),
            config: Config::load().unwrap_or_default(),
            show_help: false,
        }
    }

    pub fn handle_key(&mut self, key: KeyEvent) -> Result<bool> {
        match self.state {
            AppState::Welcome => self.handle_welcome_keys(key),
            AppState::FileSelection => self.handle_file_selection_keys(key),
            AppState::FolderSelection => self.handle_folder_selection_keys(key),
            AppState::EpisodeSelection => self.handle_episode_selection_keys(key),
            AppState::Downloading => self.handle_downloading_keys(key),
            AppState::Settings => self.handle_settings_keys(key),
        }
    }

    fn handle_welcome_keys(&mut self, key: KeyEvent) -> Result<bool> {
        match key.code {
            KeyCode::Enter => {
                self.state = AppState::FileSelection;
                Ok(false)
            }
            KeyCode::Char('q') => Ok(true),
            _ => Ok(false),
        }
    }

    fn handle_file_selection_keys(&mut self, key: KeyEvent) -> Result<bool> {
        match key.code {
            KeyCode::Esc => Ok(true),
            KeyCode::Enter => {
                if self.input_buffer.is_empty() {
                    return Ok(false);
                }
                self.m3u_path = Some(self.input_buffer.clone());
                self.input_buffer.clear();
                self.load_m3u_file()?;
                self.state = AppState::FolderSelection;
                Ok(false)
            }
            KeyCode::Char(c) => {
                self.input_buffer.push(c);
                Ok(false)
            }
            KeyCode::Backspace => {
                self.input_buffer.pop();
                Ok(false)
            }
            _ => Ok(false),
        }
    }

    fn handle_folder_selection_keys(&mut self, key: KeyEvent) -> Result<bool> {
        match key.code {
            KeyCode::Esc => {
                self.state = AppState::FileSelection;
                Ok(false)
            }
            KeyCode::Enter => {
                if self.input_buffer.is_empty() {
                    return Ok(false);
                }
                self.download_folder = Some(PathBuf::from(&self.input_buffer));
                self.input_buffer.clear();
                self.check_existing_files()?;
                self.state = AppState::EpisodeSelection;
                Ok(false)
            }
            KeyCode::Char(c) => {
                self.input_buffer.push(c);
                Ok(false)
            }
            KeyCode::Backspace => {
                self.input_buffer.pop();
                Ok(false)
            }
            _ => Ok(false),
        }
    }

    fn handle_episode_selection_keys(&mut self, key: KeyEvent) -> Result<bool> {
        match key.code {
            KeyCode::Esc => {
                self.state = AppState::FolderSelection;
                Ok(false)
            }
            KeyCode::Enter => {
                self.prepare_downloads()?;
                self.state = AppState::Downloading;
                Ok(false)
            }
            KeyCode::Up => {
                if let Some(idx) = self.selected_episode_idx {
                    if idx > 0 {
                        self.selected_episode_idx = Some(idx - 1);
                    }
                }
                Ok(false)
            }
            KeyCode::Down => {
                if let Some(idx) = self.selected_episode_idx {
                    if idx < self.episodes.len().saturating_sub(1) {
                        self.selected_episode_idx = Some(idx + 1);
                    }
                }
                Ok(false)
            }
            KeyCode::Char(' ') => {
                if let Some(idx) = self.selected_episode_idx {
                    self.episode_selections[idx] = !self.episode_selections[idx];
                }
                Ok(false)
            }
            KeyCode::Char('a') => {
                // Select all
                for i in 0..self.episode_selections.len() {
                    self.episode_selections[i] = true;
                }
                Ok(false)
            }
            KeyCode::Char('n') => {
                // Select none
                for i in 0..self.episode_selections.len() {
                    self.episode_selections[i] = false;
                }
                Ok(false)
            }
            _ => Ok(false),
        }
    }

    fn handle_downloading_keys(&mut self, key: KeyEvent) -> Result<bool> {
        match key.code {
            KeyCode::Esc | KeyCode::Char('q') => Ok(true),
            KeyCode::Char('p') => {
                if let Some(idx) = self.selected_download_idx {
                    self.toggle_pause_download(idx)?;
                }
                Ok(false)
            }
            KeyCode::Char('c') => {
                if let Some(idx) = self.selected_download_idx {
                    self.cancel_download(idx)?;
                }
                Ok(false)
            }
            KeyCode::Char('s') => {
                self.state = AppState::Settings;
                Ok(false)
            }
            KeyCode::Up => {
                if let Some(idx) = self.selected_download_idx {
                    if idx > 0 {
                        self.selected_download_idx = Some(idx - 1);
                    }
                }
                Ok(false)
            }
            KeyCode::Down => {
                if let Some(idx) = self.selected_download_idx {
                    if idx < self.downloads.len().saturating_sub(1) {
                        self.selected_download_idx = Some(idx + 1);
                    }
                }
                Ok(false)
            }
            KeyCode::Char('h') => {
                self.show_help = !self.show_help;
                Ok(false)
            }
            _ => Ok(false),
        }
    }

    fn handle_settings_keys(&mut self, key: KeyEvent) -> Result<bool> {
        match key.code {
            KeyCode::Esc => {
                self.state = AppState::Downloading;
                Ok(false)
            }
            KeyCode::Enter => {
                self.config.save()?;
                self.state = AppState::Downloading;
                Ok(false)
            }
            KeyCode::Up => {
                // Move through settings
                Ok(false)
            }
            KeyCode::Down => {
                // Move through settings
                Ok(false)
            }
            KeyCode::Left | KeyCode::Right => {
                // Adjust selected setting value
                Ok(false)
            }
            _ => Ok(false),
        }
    }

    pub fn on_tick(&mut self) {
        // Update download progress information
        self.update_downloads();
    }

    fn load_m3u_file(&mut self) -> Result<()> {
        if let Some(path) = &self.m3u_path {
            self.episodes = crate::m3u::parse_m3u_file(path)?;
            self.episode_selections = vec![false; self.episodes.len()];
        }
        Ok(())
    }

    fn check_existing_files(&mut self) -> Result<()> {
        // Implementation for checking existing files
        Ok(())
    }

    fn prepare_downloads(&mut self) -> Result<()> {
        self.downloads.clear();
        self.selected_download_idx = Some(0);

        for (idx, episode) in self.episodes.iter().enumerate() {
            if self.episode_selections[idx] {
                let download = Download::new(episode.clone(), self.download_folder.clone().unwrap());
                self.downloads.push(download);
            }
        }

        // Start initial batch of downloads based on parallel_downloads setting
        self.start_downloads()?;

        Ok(())
    }

    fn start_downloads(&mut self) -> Result<()> {
        let max_parallel = self.config.parallel_downloads;
        let mut current_running = 0;

        for download in &mut self.downloads {
            if current_running >= max_parallel {
                break;
            }

            if download.status == DownloadStatus::Queued {
                download.start(&self.config)?;
                current_running += 1;
            } else if download.status == DownloadStatus::Downloading {
                current_running += 1;
            }
        }

        Ok(())
    }

    fn update_downloads(&mut self) {
        let mut completed = 0;
        let mut running = 0;

        for download in &mut self.downloads {
            download.update_progress();

            match download.status {
                DownloadStatus::Completed | DownloadStatus::Failed(_) | DownloadStatus::Cancelled => {
                    completed += 1;
                }
                DownloadStatus::Downloading => {
                    running += 1;
                }
                _ => {}
            }
        }

        // Start new downloads if we have capacity
        if running < self.config.parallel_downloads {
            let _ = self.start_downloads();
        }
    }

    fn toggle_pause_download(&mut self, idx: usize) -> Result<()> {
        if idx < self.downloads.len() {
            self.downloads[idx].toggle_pause()?;
        }
        Ok(())
    }

    fn cancel_download(&mut self, idx: usize) -> Result<()> {
        if idx < self.downloads.len() {
            self.downloads[idx].cancel()?;
        }
        Ok(())
    }
}
