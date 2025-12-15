use anyhow::Result;
use comfy_table::{presets::UTF8_FULL, Cell, ContentArrangement, Table};
use console::{style, Term};
use dialoguer::{Confirm, Input};
use std::path::Path;
use crate::types::{LinkInfo, Settings};
use crate::parser::parse_number_ranges;
use crate::utils::get_output_file;

pub fn customize(term: &Term, settings: &mut Settings) -> Result<()> {
    loop {
        term.clear_screen()?;
        let mut table = Table::new();
        table.load_preset(UTF8_FULL).set_header(vec!["No.", "Setting", "Value"]).set_content_arrangement(ContentArrangement::Dynamic);
        table.add_row(vec!["1", "Parallel Downloads", &settings.parallel_downloads.to_string()]);
        table.add_row(vec!["2", "Retries", &settings.retries.to_string()]);
        table.add_row(vec!["3", "Speed Limit (e.g., 500k, 2M)", settings.speed_limit.as_deref().unwrap_or("None")]);
        table.add_row(vec!["4", "Timeout (seconds)", &settings.timeout.to_string()]);
        table.add_row(vec!["5", "FFmpeg Path", &settings.ffmpeg_path]);
        term.write_line(&format!("{}", table))?;

        let choices: String = Input::new().with_prompt("Enter numbers to change (e.g., 1,3)").allow_empty(true).interact_text_on(term)?;
        if choices.is_empty() { break; }

        for choice in choices.split(',') {
            match choice.trim() {
                "1" => settings.parallel_downloads = Input::new().with_prompt("Parallel downloads").default(settings.parallel_downloads).interact_text_on(term)?,
                "2" => settings.retries = Input::new().with_prompt("Retries").default(settings.retries).interact_text_on(term)?,
                "3" => {
                    let limit: String = Input::new().with_prompt("Speed limit (e.g., 500k, 2M)").default(settings.speed_limit.clone().unwrap_or_default()).allow_empty(true).interact_text_on(term)?;
                    settings.speed_limit = if limit.is_empty() { None } else { Some(limit) };
                }
                "4" => settings.timeout = Input::new().with_prompt("Timeout (seconds)").default(settings.timeout).interact_text_on(term)?,
                "5" => settings.ffmpeg_path = Input::new().with_prompt("FFmpeg path ('ffmpeg' for system PATH)").default(settings.ffmpeg_path.clone()).interact_text_on(term)?,
                _ => {}
            }
        }

        if !Confirm::new().with_prompt("Change more settings?").default(false).interact_on(term)? { break; }
    }
    Ok(())
}

pub fn check_existing(term: &Term, links: &[LinkInfo], folder: &Path) -> Result<Vec<LinkInfo>> {
    let mut existing = Vec::new();
    for (idx, link) in links.iter().enumerate() {
        let output = get_output_file(link, folder, links);
        if output.exists() {
            let size = output.metadata()?.len() as f64 / 1_048_576.0;
            existing.push((idx + 1, output.file_name().unwrap().to_string_lossy().to_string(), size));
        }
    }

    if !existing.is_empty() {
        term.write_line(&format!("\n{}", style("The following files already exist:").bold().yellow()))?;
        let mut table = Table::new();
        table.load_preset(UTF8_FULL).set_header(vec!["No.", "File Name", "Size (MB)"]);
        for (idx, name, size) in existing {
            table.add_row(vec![Cell::new(idx), Cell::new(&name), Cell::new(format!("{:.2}", size))]);
        }
        term.write_line(&format!("{}", table))?;

        let choices: String = Input::new().with_prompt("Select files to overwrite (e.g., 1-3,5)").allow_empty(true).interact_text_on(term)?;
        let overwrite = parse_number_ranges(&choices);

        return Ok(links.iter().enumerate()
            .filter(|(idx, link)| overwrite.contains(&(idx + 1)) || !get_output_file(link, folder, links).exists())
            .map(|(_, link)| link.clone())
            .collect());
    }

    Ok(links.to_vec())
}
