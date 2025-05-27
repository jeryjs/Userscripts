use anyhow::{anyhow, Result};
use regex::Regex;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Clone, Debug)]
pub struct Episode {
    pub name: String,
    pub url: String,
}

pub fn parse_m3u_file<P: AsRef<Path>>(path: P) -> Result<Vec<Episode>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut episodes = Vec::new();
    let mut current_name = String::new();

    for line in reader.lines() {
        let line = line?;
        if line.starts_with("#EXTINF:") {
            // Extract name from #EXTINF line (format: #EXTINF:-1,Episode Name)
            if let Some(name_part) = line.split(',').nth(1) {
                current_name = name_part.trim().to_string();
            }
        } else if !line.starts_with('#') && !line.trim().is_empty() {
            // This is a URL line
            if !current_name.is_empty() {
                episodes.push(Episode {
                    name: current_name.clone(),
                    url: line.trim().to_string(),
                });
                current_name.clear();
            }
        }
    }

    Ok(episodes)
}

pub fn get_file_extension(url: &str) -> &str {
    if url.contains(".m3u8") {
        ".mp4"
    } else {
        Path::new(url)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| if !ext.is_empty() { ext } else { "mp4" })
            .unwrap_or("mp4")
    }
}

pub fn sanitize_filename(name: &str) -> String {
    let re = Regex::new(r#"[\\/:*?"<>|]"#).unwrap();
    re.replace_all(name, "_").to_string()
}
