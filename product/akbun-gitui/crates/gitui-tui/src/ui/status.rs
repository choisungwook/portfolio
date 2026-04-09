use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem};
use ratatui::Frame;

use crate::app::App;
use gitui_core::status::FileStatusKind;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let mut items: Vec<ListItem> = Vec::new();
    let mut flat_index: usize = 0;

    if !app.status.staged.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(
            "-- Staged --",
            Style::default()
                .fg(Color::Green)
                .add_modifier(Modifier::BOLD),
        ))));

        for file in &app.status.staged {
            let selected = app.status_selected == flat_index;
            let prefix = status_prefix(&file.status);
            let style = if selected {
                Style::default()
                    .fg(Color::Green)
                    .add_modifier(Modifier::REVERSED)
            } else {
                Style::default().fg(Color::Green)
            };
            items.push(ListItem::new(Line::from(Span::styled(
                format!("  {} {}", prefix, file.path),
                style,
            ))));
            flat_index += 1;
        }
    }

    if !app.status.unstaged.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(
            "-- Unstaged --",
            Style::default()
                .fg(Color::Red)
                .add_modifier(Modifier::BOLD),
        ))));

        for file in &app.status.unstaged {
            let selected = app.status_selected == flat_index;
            let prefix = status_prefix(&file.status);
            let style = if selected {
                Style::default()
                    .fg(Color::Red)
                    .add_modifier(Modifier::REVERSED)
            } else {
                Style::default().fg(Color::Red)
            };
            items.push(ListItem::new(Line::from(Span::styled(
                format!("  {} {}", prefix, file.path),
                style,
            ))));
            flat_index += 1;
        }
    }

    if !app.status.untracked.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(
            "-- Untracked --",
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ))));

        for file in &app.status.untracked {
            let selected = app.status_selected == flat_index;
            let style = if selected {
                Style::default()
                    .fg(Color::Yellow)
                    .add_modifier(Modifier::REVERSED)
            } else {
                Style::default().fg(Color::Yellow)
            };
            items.push(ListItem::new(Line::from(Span::styled(
                format!("  ? {}", file.path),
                style,
            ))));
            flat_index += 1;
        }
    }

    if items.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(
            "  Working tree clean",
            Style::default().fg(Color::DarkGray),
        ))));
    }

    let list = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Status ")
            .style(Style::default().fg(Color::White)),
    );

    frame.render_widget(list, area);
}

fn status_prefix(kind: &FileStatusKind) -> &'static str {
    match kind {
        FileStatusKind::New => "A",
        FileStatusKind::Modified => "M",
        FileStatusKind::Deleted => "D",
        FileStatusKind::Renamed => "R",
        FileStatusKind::Typechange => "T",
    }
}
