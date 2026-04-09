use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem};
use ratatui::Frame;

use crate::app::App;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let local: Vec<&gitui_core::branch::BranchInfo> =
        app.branches.iter().filter(|b| !b.is_remote).collect();
    let remote: Vec<&gitui_core::branch::BranchInfo> =
        app.branches.iter().filter(|b| b.is_remote).collect();

    let mut items: Vec<ListItem> = Vec::new();
    let mut flat_index: usize = 0;

    if !local.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(
            "-- Local --",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ))));

        for branch in &local {
            let selected = app.branch_selected == flat_index;
            let marker = if branch.is_head { "* " } else { "  " };
            let color = if branch.is_head {
                Color::Green
            } else {
                Color::White
            };
            let style = if selected {
                Style::default()
                    .fg(color)
                    .add_modifier(Modifier::REVERSED)
            } else {
                Style::default().fg(color)
            };
            items.push(ListItem::new(Line::from(Span::styled(
                format!("{}{}", marker, branch.name),
                style,
            ))));
            flat_index += 1;
        }
    }

    if !remote.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(
            "-- Remote --",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ))));

        for branch in &remote {
            let selected = app.branch_selected == flat_index;
            let style = if selected {
                Style::default()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::REVERSED)
            } else {
                Style::default().fg(Color::DarkGray)
            };
            items.push(ListItem::new(Line::from(Span::styled(
                format!("  {}", branch.name),
                style,
            ))));
            flat_index += 1;
        }
    }

    if items.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(
            "  No branches found",
            Style::default().fg(Color::DarkGray),
        ))));
    }

    let list = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Branches ")
            .style(Style::default().fg(Color::White)),
    );

    frame.render_widget(list, area);
}
