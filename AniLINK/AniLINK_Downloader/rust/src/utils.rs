use sanitize_filename::sanitize;
use std::path::{Path, PathBuf};
use crate::types::LinkInfo;

pub fn get_output_file(link_info: &LinkInfo, folder: &Path, all_links: &[LinkInfo]) -> PathBuf {
    let mut name_without_ext = link_info.name.clone();

    // Smart quality tagging
    if let Some(quality) = &link_info.quality {
        let base_name = &link_info.name;
        let duplicates: Vec<_> = all_links
            .iter()
            .filter(|l| l.name == *base_name)
            .map(|l| l.id)
            .collect();
        if duplicates.len() > 1 {
            if let Some(pos) = duplicates.iter().position(|&id| id == link_info.id) {
                if pos > 0 {
                    name_without_ext = format!("{} {}", name_without_ext, quality);
                }
            }
        }
    }

    let sanitized_name = sanitize(&name_without_ext);
    folder.join(format!("{}.mkv", sanitized_name))
}
