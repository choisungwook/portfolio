use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem};
use ratatui::Frame;

use crate::app::App;
use gitui_core::credential::CredentialType;

pub fn render(frame: &mut Frame, app: &App) {
    let area = centered_rect(50, 50, frame.area());
    frame.render_widget(Clear, area);

    let mut items: Vec<ListItem> = Vec::new();
    let active = app.credential_store.active_index;

    for (i, cred) in app.credential_store.credentials.iter().enumerate() {
        let selected = active == Some(i);
        let marker = if selected { "> " } else { "  " };

        let detail = match &cred.credential_type {
            CredentialType::SshKey { private_key_path, .. } => {
                format!("SSH: {}", private_key_path.display())
            }
            CredentialType::Token { .. } => "Token".to_string(),
            CredentialType::HttpBasic { username, .. } => {
                format!("HTTP: {}", username)
            }
        };

        let style = if selected {
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(Color::White)
        };

        items.push(ListItem::new(Line::from(vec![
            Span::styled(marker, style),
            Span::styled(cred.name.clone(), style),
            Span::styled(format!("  ({})", detail), Style::default().fg(Color::DarkGray)),
        ])));
    }

    if items.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(
            "  No credentials configured",
            Style::default().fg(Color::DarkGray),
        ))));
    }

    let list = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Credential Picker (Enter: select, Esc: close) ")
            .style(Style::default().fg(Color::Yellow)),
    );

    frame.render_widget(list, area);
}

fn centered_rect(percent_x: u16, percent_y: u16, area: Rect) -> Rect {
    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(area);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(vertical[1])[1]
}
