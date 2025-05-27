use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct Config {
    pub parallel_downloads: usize,
    pub retries: usize,
    pub speed_limit: Option<String>,
    pub timeout: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            parallel_downloads: 4,
            retries: 3,
            speed_limit: None,
            timeout: 30,
        }
    }
}

impl Config {
    pub fn load() -> Result<Self> {
        Ok(confy::load("anilink_downloader", "config")?)
    }

    pub fn save(&self) -> Result<()> {
        Ok(confy::store("anilink_downloader", "config", self)?)
    }
}
