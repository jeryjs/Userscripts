use anyhow::Result;
use regex::Regex;
use std::collections::BTreeSet;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use parking_lot::Mutex;
use crate::types::{LinkInfo, Subtitle};

pub fn parse_m3u(file_path: &Path) -> Result<Vec<LinkInfo>> {
    let file = File::open(file_path)?;
    let reader = BufReader::new(file);
    let lines: Vec<String> = reader.lines().collect::<Result<_, _>>()?;

    let mut links = Vec::new();
    let mut referer: Option<String> = None;
    let mut subtitles: Vec<Subtitle> = Vec::new();

    let name_re = Regex::new(r#"NAME="([^"]+)""#).unwrap();
    let uri_re = Regex::new(r#"URI="([^"]+)""#).unwrap();

    for (i, line) in lines.iter().enumerate() {
        if let Some(r) = line.strip_prefix("#EXTVLCOPT:http-referrer=") {
            referer = Some(r.to_string());
        } else if line.starts_with("#EXT-X-MEDIA:TYPE=SUBTITLES") {
            let name = name_re
                .captures(line)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| "Subtitle".to_string());
            if let Some(uri_cap) = uri_re.captures(line) {
                if let Some(url) = uri_cap.get(1) {
                    subtitles.push(Subtitle {
                        name,
                        url: url.as_str().to_string(),
                        default: line.contains("DEFAULT=YES"),
                    });
                }
            }
        } else if let Some(info) = line.strip_prefix("#EXTINF:") {
            let name = info
                .split(',')
                .nth(1)
                .unwrap_or(&format!("Episode {}", links.len() + 1))
                .to_string();
            if let Some(url) = lines.get(i + 1) {
                if !url.starts_with('#') {
                    let mut parsed_name = name.clone();
                    if let Some(stripped) = parsed_name.strip_suffix(".mp4") {
                        parsed_name = stripped.to_string();
                    } else if let Some(stripped) = parsed_name.strip_suffix(".m3u8") {
                        parsed_name = stripped.to_string();
                    }
                    let mut quality = None;
                    if let (Some(start), Some(end)) = (name.rfind('['), name.rfind(']')) {
                        if start < end {
                            quality = Some(name[start..=end].to_string());
                            parsed_name = name[..start].trim().to_string();
                        }
                    }
                    links.push(LinkInfo {
                        id: links.len(),
                        name: parsed_name,
                        url: url.clone(),
                        referer: referer.clone(),
                        subtitles: subtitles.clone(),
                        quality,
                        process_id: Arc::new(Mutex::new(None)),
                        paused: Arc::new(AtomicBool::new(false)),
                    });
                    subtitles.clear();
                }
            }
        }
    }
    Ok(links)
}

pub fn parse_number_ranges(s: &str) -> BTreeSet<usize> {
    let mut result = BTreeSet::new();
    for part in s.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some((a_str, b_str)) = part.split_once('-') {
            if let (Ok(a), Ok(b)) = (a_str.trim().parse(), b_str.trim().parse()) {
                for i in a..=b {
                    result.insert(i);
                }
            }
        } else if let Ok(n) = part.parse() {
            result.insert(n);
        }
    }
    result
}

pub fn parse_ffmpeg_duration(line: &str) -> Option<f64> {
    let time_str = line.split("Duration: ").nth(1)?.split(',').next()?;
    if time_str.contains("N/A") {
        return None;
    }
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().ok()?;
        let m: f64 = parts[1].parse().ok()?;
        let s: f64 = parts[2].parse().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else {
        None
    }
}

pub fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    let time_str = line.split("time=").nth(1)?.split_whitespace().next()?;
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().ok()?;
        let m: f64 = parts[1].parse().ok()?;
        let s: f64 = parts[2].parse().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else {
        None
    }
}
