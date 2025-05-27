use crate::app::{App, AppState};
use crate::downloader::DownloadStatus;
use ratatui::{
    backend::Backend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Span, Spans},
    widgets::{Block, Borders, Clear, List, ListItem, ListState, Paragraph, Tabs},
    Frame,
};
use unicode_width::UnicodeWidthStr;

pub fn draw<B: Backend>(f: &mut Frame<B>, app: &mut App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Title
            Constraint::Min(1),     // Content
            Constraint::Length(3),  // Command panel
        ])
        .split(f.size());

    draw_title(f, app, chunks[0]);
    
    match app.state {
        AppState::Welcome => draw_welcome(f, app, chunks[1]),
        AppState::FileSelection => draw_file_selection(f, app, chunks[1]),
        AppState::FolderSelection => draw_folder_selection(f, app, chunks[1]),
        AppState::EpisodeSelection => draw_episode_selection(f, app, chunks[1]),
        AppState::Downloading => draw_downloading(f, app, chunks[1]),
        AppState::Settings => draw_settings(f, app, chunks[1]),
    }
    
    draw_command_panel(f, app, chunks[2]);
    
    // Draw help overlay if enabled
    if app.show_help {
        draw_help_popup(f);
    }
}

fn draw_title<B: Backend>(f: &mut Frame<B>, app: &App, area: Rect) {
    let title = match app.state {
        AppState::Welcome => "AniLINK Downloader",
        AppState::FileSelection => "Select M3U File",
        AppState::FolderSelection => "Select Download Folder",
        AppState::EpisodeSelection => "Select Episodes",
        AppState::Downloading => "Downloading Episodes",
        AppState::Settings => "Settings",
    };
    
    let title_block = Block::default()
        .borders(Borders::ALL)
        .style(Style::default());
    
    let title_text = Paragraph::new(title)
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .block(title_block);
    
    f.render_widget(title_text, area);
}

fn draw_welcome<B: Backend>(f: &mut Frame<B>, app: &App, area: Rect) {
    let text = vec![
        Spans::from(Span::styled("Welcome to AniLINK Downloader", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))),
        Spans::from(""),
        Spans::from("This application helps you download videos from M3U playlists."),
        Spans::from(""),
        Spans::from(Span::styled("Press ENTER to continue", Style::default().fg(Color::Green))),
    ];
    
    let paragraph = Paragraph::new(text)
        .block(Block::default().borders(Borders::ALL))
        .alignment(ratatui::layout::Alignment::Center);
    
    f.render_widget(paragraph, area);
}

fn draw_file_selection<B: Backend>(f: &mut Frame<B>, app: &App, area: Rect) {
    let text = vec![
        Spans::from("Enter the path to your M3U file:"),
        Spans::from(""),
        Spans::from(Span::styled(&app.input_buffer, Style::default().fg(Color::Yellow))),
    ];
    
    let paragraph = Paragraph::new(text)
        .block(Block::default().borders(Borders::ALL));
    
    f.render_widget(paragraph, area);
}

fn draw_folder_selection<B: Backend>(f: &mut Frame<B>, app: &App, area: Rect) {
    let text = vec![
        Spans::from("Enter the folder to save videos in:"),
        Spans::from(""),
        Spans::from(Span::styled(&app.input_buffer, Style::default().fg(Color::Yellow))),
    ];
    
    let paragraph = Paragraph::new(text)
        .block(Block::default().borders(Borders::ALL));
    
    f.render_widget(paragraph, area);
}

fn draw_episode_selection<B: Backend>(f: &mut Frame<B>, app: &App, area: Rect) {
    let items: Vec<ListItem> = app.episodes
        .iter()
        .enumerate()
        .map(|(idx, episode)| {
            let checkbox = if app.episode_selections[idx] { "[x]" } else { "[ ]" };
            ListItem::new(format!("{} {}", checkbox, episode.name))
        })
        .collect();
    
    let mut state = ListState::default();
    state.select(app.selected_episode_idx);
    
    let episodes_list = List::new(items)
        .block(Block::default().title("Episodes").borders(Borders::ALL))
        .highlight_style(Style::default().fg(Color::Yellow).add_modifier(Modifier::REVERSED));
    
    f.render_stateful_widget(episodes_list, area, &mut state);
}

fn draw_downloading<B: Backend>(f: &mut Frame<B>, app: &App, area: Rect) {
    let items: Vec<ListItem> = app.downloads
        .iter()
        .map(|download| {
            let status_str = match download.status {
                DownloadStatus::Queued => "Queued",
                DownloadStatus::Downloading => "Downloading",
                DownloadStatus::Paused => "Paused",
                DownloadStatus::Completed => "Completed",
                DownloadStatus::Failed(ref err) => "Failed",
                DownloadStatus::Cancelled => "Cancelled",
            };
            
            let style = match download.status {
                DownloadStatus::Completed => Style::default().fg(Color::Green),
                DownloadStatus::Failed(_) => Style::default().fg(Color::Red),
                DownloadStatus::Cancelled => Style::default().fg(Color::Red),
                DownloadStatus::Paused => Style::default().fg(Color::Yellow),
                _ => Style::default(),
            };
            
            let progress_percent = (download.progress).round() as u64;
            let file_size_mb = download.file_size as f64 / (1024.0 * 1024.0);
            
            ListItem::new(format!(
                "{} - {}: {}% ({:.1}MB) - Time remaining: {:.0}s",
                download.episode.name,
                status_str,
                progress_percent,
                file_size_mb,
                download.remaining_time
            )).style(style)
        })
        .collect();
    
    let mut state = ListState::default();
    state.select(app.selected_download_idx);
    
    let downloads_list = List::new(items)
        .block(Block::default().title("Downloads").borders(Borders::ALL))
        .highlight_style(Style::default().fg(Color::Yellow).add_modifier(Modifier::REVERSED));
    
    f.render_stateful_widget(downloads_list, area, &mut state);
}

fn draw_settings<B: Backend>(f: &mut Frame<B>, app: &App, area: Rect) {
    let items = vec![
        ListItem::new(format!("Parallel Downloads: {}", app.config.parallel_downloads)),
        ListItem::new(format!("Retries: {}", app.config.retries)),
        ListItem::new(format!("Speed Limit: {}", app.config.speed_limit.as_deref().unwrap_or("None"))),
        ListItem::new(format!("Timeout: {}s", app.config.timeout)),
    ];
    
    let settings_list = List::new(items)
        .block(Block::default().title("Settings").borders(Borders::ALL))
        .highlight_style(Style::default().fg(Color::Yellow).add_modifier(Modifier::REVERSED));
    
    f.render_widget(settings_list, area);
}

fn draw_command_panel<B: Backend>(f: &mut Frame<B>, app: &App, area: Rect) {
    let commands = match app.state {
        AppState::Welcome => vec!["ENTER: Start", "Q: Quit"],
        AppState::FileSelection => vec!["ENTER: Confirm", "ESC: Quit"],
        AppState::FolderSelection => vec!["ENTER: Confirm", "ESC: Back"],
        AppState::EpisodeSelection => vec!["SPACE: Toggle", "ENTER: Start Downloads", "A: Select All", "N: Select None", "ESC: Back"],
        AppState::Downloading => vec!["P: Pause/Resume", "C: Cancel", "S: Settings", "H: Help", "Q: Quit"],
        AppState::Settings => vec!["↑↓: Navigate", "←→: Change Value", "ENTER: Save", "ESC: Cancel"],
    };
    
    let command_spans: Vec<Spans> = commands.iter()
        .map(|cmd| {
            Spans::from(vec![
                Span::styled(cmd, Style::default().fg(Color::Green))
            ])
        })
        .collect();
    
    let command_panel = Paragraph::new(command_spans)
        .block(Block::default().borders(Borders::ALL).title("Commands"))
        .alignment(ratatui::layout::Alignment::Center);
    
    f.render_widget(command_panel, area);
}

fn draw_help_popup<B: Backend>(f: &mut Frame<B>, ) {
    let popup_area = centered_rect(60, 20, f.size());
    
    // Clear the area
    f.render_widget(Clear, popup_area);
    
    let text = vec![
        Spans::from(Span::styled("Help", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))),
        Spans::from(""),
        Spans::from("Navigation:"),
        Spans::from("  ↑↓: Navigate through lists"),
        Spans::from("  ENTER: Confirm selection"),
        Spans::from("  ESC: Go back or cancel"),
        Spans::from(""),
        Spans::from("Episode Selection:"),
        Spans::from("  SPACE: Toggle selected episode"),
        Spans::from("  A: Select all episodes"),
        Spans::from("  N: Deselect all episodes"),
        Spans::from(""),
        Spans::from("Downloads:"),
        Spans::from("  P: Pause/resume selected download"),
        Spans::from("  C: Cancel selected download"),
        Spans::from("  S: Open settings"),
        Spans::from(""),
        Spans::from(Span::styled("Press H to close this help", Style::default().fg(Color::Green))),
    ];
    
    let help_paragraph = Paragraph::new(text)
        .block(Block::default().title("Help").borders(Borders::ALL))
        .alignment(ratatui::layout::Alignment::Left);
    
    f.render_widget(help_paragraph, popup_area);
}

// Helper function to create a centered rect
fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}
