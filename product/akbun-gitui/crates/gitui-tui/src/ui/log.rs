use ratatui::layout::{Constraint, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::widgets::{Block, Borders, Cell, Row, Table};
use ratatui::Frame;

use crate::app::App;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let header = Row::new(vec![
        Cell::from("ID").style(Style::default().fg(Color::Cyan)),
        Cell::from("Author").style(Style::default().fg(Color::Cyan)),
        Cell::from("Message").style(Style::default().fg(Color::Cyan)),
        Cell::from("Time").style(Style::default().fg(Color::Cyan)),
    ])
    .height(1);

    let rows: Vec<Row> = app
        .log_entries
        .iter()
        .enumerate()
        .map(|(i, entry)| {
            let style = if i == app.log_selected {
                Style::default().add_modifier(Modifier::REVERSED)
            } else {
                Style::default()
            };

            let time_str = format_relative_time(&entry.time);
            let message = entry.message.lines().next().unwrap_or("");

            Row::new(vec![
                Cell::from(entry.short_id.clone()).style(Style::default().fg(Color::Yellow)),
                Cell::from(entry.author.clone()).style(Style::default().fg(Color::Green)),
                Cell::from(message.to_string()),
                Cell::from(time_str).style(Style::default().fg(Color::DarkGray)),
            ])
            .style(style)
        })
        .collect();

    let widths = [
        Constraint::Length(8),
        Constraint::Length(16),
        Constraint::Min(20),
        Constraint::Length(14),
    ];

    let table = Table::new(rows, widths)
        .header(header)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Log ")
                .style(Style::default().fg(Color::White)),
        )
        .column_spacing(1);

    frame.render_widget(table, area);
}

fn format_relative_time(time: &chrono::DateTime<chrono::Utc>) -> String {
    let now = chrono::Utc::now();
    let duration = now.signed_duration_since(time);

    let seconds = duration.num_seconds();
    if seconds < 60 {
        return format!("{}s ago", seconds);
    }

    let minutes = duration.num_minutes();
    if minutes < 60 {
        return format!("{}m ago", minutes);
    }

    let hours = duration.num_hours();
    if hours < 24 {
        return format!("{}h ago", hours);
    }

    let days = duration.num_days();
    if days < 30 {
        return format!("{}d ago", days);
    }

    let months = days / 30;
    if months < 12 {
        return format!("{}mo ago", months);
    }

    let years = days / 365;
    format!("{}y ago", years)
}
