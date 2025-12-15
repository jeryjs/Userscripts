use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use parking_lot::Mutex;
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
    Frame, Terminal,
};
use std::io;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use crate::types::{DownloadStatus, LinkInfo};
use crate::process::{pause_process, resume_process, kill_process};

pub struct DownloadTUI {
    pub selected: Option<usize>,
    pub list_state: ListState,
    pub downloads: Arc<Mutex<Vec<(LinkInfo, DownloadStatus)>>>,
}

impl DownloadTUI {
    pub fn new_with_state(downloads: Arc<Mutex<Vec<(LinkInfo, DownloadStatus)>>>) -> Self {
        let mut list_state = ListState::default();
        let len = downloads.lock().len();
        if len > 0 {
            list_state.select(Some(0));
        }
        Self {
            selected: if len == 0 { None } else { Some(0) },
            list_state,
            downloads,
        }
    }

    pub fn next(&mut self) {
        let len = self.downloads.lock().len();
        if len == 0 {
            return;
        }
        let current = self.list_state.selected().unwrap_or(0);
        let next = if current >= len - 1 { 0 } else { current + 1 };
        self.selected = Some(next);
        self.list_state.select(Some(next));
    }

    pub fn previous(&mut self) {
        let len = self.downloads.lock().len();
        if len == 0 {
            return;
        }
        let current = self.list_state.selected().unwrap_or(0);
        let prev = if current == 0 { len - 1 } else { current - 1 };
        self.selected = Some(prev);
        self.list_state.select(Some(prev));
    }

    pub fn toggle_pause(&mut self) {
        if let Some(selected) = self.selected {
            let mut downloads = self.downloads.lock();
            if selected < downloads.len() {
                let (link_info, _) = &mut downloads[selected];
                let was_paused = link_info.paused.load(Ordering::SeqCst);
                
                if let Some(pid) = *link_info.process_id.lock() {
                    if was_paused {
                        let _ = resume_process(pid);
                        link_info.paused.store(false, Ordering::SeqCst);
                    } else {
                        let _ = pause_process(pid);
                        link_info.paused.store(true, Ordering::SeqCst);
                    }
                }
            }
        }
    }

    pub fn toggle_pause_all(&mut self) {
        let mut downloads = self.downloads.lock();
        let any_paused = downloads.iter().any(|(li, _)| li.paused.load(Ordering::SeqCst));
        
        for (link_info, _) in downloads.iter_mut() {
            if let Some(pid) = *link_info.process_id.lock() {
                if any_paused {
                    let _ = resume_process(pid);
                    link_info.paused.store(false, Ordering::SeqCst);
                } else {
                    let _ = pause_process(pid);
                    link_info.paused.store(true, Ordering::SeqCst);
                }
            }
        }
    }

    pub fn kill_all(&self) {
        let downloads = self.downloads.lock();
        for (link_info, _) in downloads.iter() {
            if let Some(pid) = *link_info.process_id.lock() {
                let _ = kill_process(pid);
            }
        }
    }

    pub fn draw(&mut self, f: &mut Frame) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(0), Constraint::Length(3)])
            .split(f.area());

        self.draw_downloads(f, chunks[0]);
        self.draw_keybindings(f, chunks[1]);
    }

    fn draw_downloads(&mut self, f: &mut Frame, area: Rect) {
        let downloads = self.downloads.lock();
        let spinner_frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        let frame_idx = (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() / 80) as usize % spinner_frames.len();
        let spinner = spinner_frames[frame_idx];

        let items: Vec<ListItem> = downloads
            .iter()
            .enumerate()
            .map(|(idx, (link_info, status))| {
                let is_paused = link_info.paused.load(Ordering::SeqCst);
                let prefix = if Some(idx) == self.selected { "▶ " } else { "  " };
                
                let (status_text, progress_bar) = match status {
                    DownloadStatus::Pending => ("⏳ Pending".to_string(), String::new()),
                    DownloadStatus::Starting => (format!("{} Starting...", spinner), String::new()),
                    DownloadStatus::Downloading { progress, speed, size_mb } => {
                        let pause_indicator = if is_paused { "⏸ " } else { "" };
                        let bar_width = 20;
                        let filled = ((*progress / 100.0) * bar_width as f64) as usize;
                        let bar = format!("[{}{}]", "█".repeat(filled), "░".repeat(bar_width - filled));
                        (
                            format!("{}{} {:.1}% - {:.1}MB @ {:.2}x", pause_indicator, spinner, progress, size_mb, speed),
                            bar
                        )
                    }
                    DownloadStatus::Paused => ("⏸ Paused".to_string(), String::new()),
                    DownloadStatus::Completed { size_mb } => (format!("✓ {:.1}MB", size_mb), "[████████████████████]".to_string()),
                    DownloadStatus::Failed { error } => (format!("✗ {}", error), String::new()),
                };

                let color = match status {
                    DownloadStatus::Completed { .. } => Color::Green,
                    DownloadStatus::Failed { .. } => Color::Red,
                    DownloadStatus::Starting => Color::Yellow,
                    DownloadStatus::Downloading { .. } if is_paused => Color::Yellow,
                    DownloadStatus::Downloading { .. } => Color::Cyan,
                    _ => Color::Gray,
                };

                let content = if progress_bar.is_empty() {
                    Line::from(vec![
                        Span::raw(prefix),
                        Span::styled(&link_info.name, Style::default().fg(color)),
                        Span::raw(" - "),
                        Span::styled(status_text, Style::default().fg(color)),
                    ])
                } else {
                    Line::from(vec![
                        Span::raw(prefix),
                        Span::styled(&link_info.name, Style::default().fg(color)),
                        Span::raw(" "),
                        Span::styled(progress_bar, Style::default().fg(color)),
                        Span::raw(" "),
                        Span::styled(status_text, Style::default().fg(color)),
                    ])
                };

                ListItem::new(content)
            })
            .collect();

        let list = List::new(items)
            .block(Block::default().borders(Borders::ALL).title("Downloads"))
            .highlight_style(Style::default().add_modifier(Modifier::BOLD).bg(Color::DarkGray))
            .highlight_symbol(">> ");

        f.render_stateful_widget(list, area, &mut self.list_state);
    }

    fn draw_keybindings(&self, f: &mut Frame, area: Rect) {
        let keybindings = vec![
            ("↑/↓", "Select"),
            ("Space", "Pause/Resume"),
            ("A", "Toggle All"),
            ("Shift+Q", "Exit"),
        ];

        let spans: Vec<Span> = keybindings
            .iter()
            .enumerate()
            .flat_map(|(idx, (key, desc))| {
                let mut v = vec![
                    Span::styled(*key, Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Span::raw(": "),
                    Span::raw(*desc),
                ];
                if idx < keybindings.len() - 1 {
                    v.push(Span::raw("  │  "));
                }
                v
            })
            .collect();

        let para = Paragraph::new(Line::from(spans))
            .block(Block::default().borders(Borders::ALL).title("Keybindings"))
            .style(Style::default().bg(Color::Black));

        f.render_widget(para, area);
    }
}

pub fn run_tui(mut tui: DownloadTUI) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut user_exited = false;
    let mut last_key_time = std::time::Instant::now();

    loop {
        terminal.draw(|f| tui.draw(f))?;

        if event::poll(Duration::from_millis(16))? {
            if let Event::Key(key) = event::read()? {
                // Debounce: ignore if less than 50ms since last key
                let now = std::time::Instant::now();
                if now.duration_since(last_key_time) < Duration::from_millis(50) {
                    continue;
                }
                last_key_time = now;

                match key.code {
                    KeyCode::Char('c') | KeyCode::Char('C') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        user_exited = true;
                        break;
                    }
                    KeyCode::Char('Q') if key.modifiers.contains(KeyModifiers::SHIFT) => {
                        user_exited = true;
                        break;
                    }
                    KeyCode::Down | KeyCode::Char('j') => tui.next(),
                    KeyCode::Up | KeyCode::Char('k') => tui.previous(),
                    KeyCode::Char(' ') => tui.toggle_pause(),
                    KeyCode::Char('a') | KeyCode::Char('A') => tui.toggle_pause_all(),
                    _ => {}
                }
            }
        }

        // Check if all downloads are complete
        let downloads = tui.downloads.lock();
        let all_done = downloads.iter().all(|(_, status)| {
            matches!(status, DownloadStatus::Completed { .. } | DownloadStatus::Failed { .. })
        });
        drop(downloads);
        
        if all_done {
            break;
        }
    }

    // If user exited with Ctrl+C, kill all processes
    if user_exited {
        tui.kill_all();
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    Ok(())
}
