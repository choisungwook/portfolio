mod branches;
mod credential;
mod diff;
mod log;
mod status;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph, Tabs};
use ratatui::Frame;

use crate::app::{App, Tab};

pub fn render(frame: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(0),
            Constraint::Length(1),
        ])
        .split(frame.area());

    render_top_bar(frame, app, chunks[0]);
    render_main(frame, app, chunks[1]);
    render_bottom_bar(frame, chunks[2]);

    if app.show_help {
        render_help_popup(frame);
    }

    if app.show_commit_input {
        render_commit_input(frame, app);
    }

    if app.show_credential_picker {
        credential::render(frame, app);
    }
}

fn render_top_bar(frame: &mut Frame, app: &App, area: Rect) {
    let top_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
        .split(area);

    let titles: Vec<Line> = Tab::ALL
        .iter()
        .map(|t| {
            let style = if *t == app.current_tab {
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::DarkGray)
            };
            Line::from(Span::styled(t.label(), style))
        })
        .collect();

    let tabs = Tabs::new(titles)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" {} ", app.repo_info.name)),
        )
        .select(app.current_tab.index())
        .highlight_style(Style::default().fg(Color::Cyan));

    frame.render_widget(tabs, top_chunks[0]);

    let branch_name = app
        .repo_info
        .current_branch
        .as_deref()
        .unwrap_or("(detached)");
    let cred_label = app.active_credential_label();

    let info = Paragraph::new(Line::from(vec![
        Span::styled(" branch: ", Style::default().fg(Color::DarkGray)),
        Span::styled(branch_name, Style::default().fg(Color::Green)),
        Span::styled(" | cred: ", Style::default().fg(Color::DarkGray)),
        Span::styled(cred_label, Style::default().fg(Color::Yellow)),
        Span::raw(" "),
    ]))
    .block(Block::default().borders(Borders::ALL));

    frame.render_widget(info, top_chunks[1]);
}

fn render_main(frame: &mut Frame, app: &App, area: Rect) {
    match app.current_tab {
        Tab::Status => status::render(frame, app, area),
        Tab::Log => log::render(frame, app, area),
        Tab::Branches => branches::render(frame, app, area),
        Tab::Diff => diff::render(frame, app, area),
    }
}

fn render_bottom_bar(frame: &mut Frame, area: Rect) {
    let keybindings = Line::from(vec![
        Span::styled(" q", Style::default().fg(Color::Cyan)),
        Span::styled(":quit ", Style::default().fg(Color::DarkGray)),
        Span::styled("1-4", Style::default().fg(Color::Cyan)),
        Span::styled(":tabs ", Style::default().fg(Color::DarkGray)),
        Span::styled("j/k", Style::default().fg(Color::Cyan)),
        Span::styled(":nav ", Style::default().fg(Color::DarkGray)),
        Span::styled("s", Style::default().fg(Color::Cyan)),
        Span::styled(":stage ", Style::default().fg(Color::DarkGray)),
        Span::styled("c", Style::default().fg(Color::Cyan)),
        Span::styled(":commit ", Style::default().fg(Color::DarkGray)),
        Span::styled("p", Style::default().fg(Color::Cyan)),
        Span::styled(":cred ", Style::default().fg(Color::DarkGray)),
        Span::styled("?", Style::default().fg(Color::Cyan)),
        Span::styled(":help ", Style::default().fg(Color::DarkGray)),
        Span::styled("r", Style::default().fg(Color::Cyan)),
        Span::styled(":refresh", Style::default().fg(Color::DarkGray)),
    ]);

    frame.render_widget(Paragraph::new(keybindings), area);
}

fn render_help_popup(frame: &mut Frame) {
    let area = centered_rect(60, 60, frame.area());
    frame.render_widget(Clear, area);

    let help_text = vec![
        Line::from(""),
        Line::from(Span::styled(
            " Keyboard Shortcuts",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )),
        Line::from(""),
        Line::from(" q / Ctrl+c    Quit"),
        Line::from(" 1-4           Switch tabs"),
        Line::from(" j / Down      Next item"),
        Line::from(" k / Up        Previous item"),
        Line::from(" s             Stage/unstage file (Status tab)"),
        Line::from(" c             Commit staged files (Status tab)"),
        Line::from(" Enter         View diff for selection"),
        Line::from(" p             Credential picker"),
        Line::from(" r             Refresh"),
        Line::from(" ?             Toggle this help"),
        Line::from(""),
        Line::from(Span::styled(
            " Press any key to close",
            Style::default().fg(Color::DarkGray),
        )),
    ];

    let popup = Paragraph::new(help_text).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Help ")
            .style(Style::default().fg(Color::White)),
    );

    frame.render_widget(popup, area);
}

fn render_commit_input(frame: &mut Frame, app: &App) {
    let area = centered_rect(60, 20, frame.area());
    frame.render_widget(Clear, area);

    let input_text = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled(" Message: ", Style::default().fg(Color::DarkGray)),
            Span::styled(&app.commit_message, Style::default().fg(Color::White)),
            Span::styled("_", Style::default().fg(Color::Cyan)),
        ]),
        Line::from(""),
        Line::from(Span::styled(
            " Enter: confirm  Esc: cancel",
            Style::default().fg(Color::DarkGray),
        )),
    ];

    let popup = Paragraph::new(input_text).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Commit ")
            .style(Style::default().fg(Color::Yellow)),
    );

    frame.render_widget(popup, area);
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
