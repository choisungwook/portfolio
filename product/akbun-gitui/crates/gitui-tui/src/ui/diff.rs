use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::app::App;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();

    if app.diff_files.is_empty() {
        lines.push(Line::from(Span::styled(
            "  No diff to display",
            Style::default().fg(Color::DarkGray),
        )));
    } else {
        for file in &app.diff_files {
            let path = file
                .new_path
                .as_deref()
                .or(file.old_path.as_deref())
                .unwrap_or("unknown");

            lines.push(Line::from(Span::styled(
                format!("--- {} ---", path),
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            )));

            for hunk in &file.hunks {
                lines.push(Line::from(Span::styled(
                    hunk.header.trim_end().to_string(),
                    Style::default().fg(Color::Cyan),
                )));

                for line in &hunk.lines {
                    let (style, prefix) = match line.origin {
                        '+' => (Style::default().fg(Color::Green), "+"),
                        '-' => (Style::default().fg(Color::Red), "-"),
                        _ => (Style::default().fg(Color::White), " "),
                    };
                    let content = line.content.trim_end();
                    lines.push(Line::from(Span::styled(
                        format!("{}{}", prefix, content),
                        style,
                    )));
                }
            }

            lines.push(Line::from(""));
        }
    }

    let paragraph = Paragraph::new(lines)
        .scroll((app.diff_scroll, 0))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Diff ")
                .style(Style::default().fg(Color::White)),
        );

    frame.render_widget(paragraph, area);
}
