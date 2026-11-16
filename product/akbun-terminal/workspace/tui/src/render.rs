//! Drawing a [`State`]. Reads the state and writes cells, nothing else, so a
//! test can render into a `TestBackend` and read the screen back as text.

use ratatui::buffer::Buffer;
use ratatui::layout::{Alignment, Position, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};
use ratatui::Frame;
use unicode_width::UnicodeWidthStr;

use crate::layout::{fit, layout, list_window, tab_spans};
use crate::state::{mark, Mode, Prompt, State, View, HEADER_SPLIT};

/// The keys shown in the help overlay, as (key after the prefix, meaning).
pub const HELP: &[(&str, &str)] = &[
    ("c", "new tab in this workspace"),
    ("x", "close this tab (ends its shell)"),
    ("n / p", "next / previous tab"),
    ("j / k, arrows", "next / previous sidebar row"),
    ("a", "switch sidebar: Workspaces / Agents"),
    ("b", "hide / show the sidebar"),
    ("P", "new project"),
    ("w", "new workspace in the selected project"),
    ("r", "rename the selected workspace, project or agent"),
    ("R", "rename this tab"),
    ("d", "delete the selected workspace"),
    (
        "PgUp / PgDn",
        "scroll back / forward (Shift+PgUp works anywhere)",
    ),
    ("q", "quit; the shells keep running"),
    ("Ctrl+G", "send a literal Ctrl+G to the shell"),
    ("?", "this help"),
];

const DIM: Style = Style::new().fg(Color::DarkGray);

pub fn render(state: &State, frame: &mut Frame) {
    let area = frame.area();
    let l = layout(area, state.sidebar);
    if l.sidebar.width > 0 {
        draw_sidebar(state, frame.buffer_mut(), l.sidebar);
    }
    draw_tabs(state, frame.buffer_mut(), l.tabs);
    draw_terminal(state, frame, l.term);
    draw_status(state, frame.buffer_mut(), l.status);
    match &state.mode {
        Mode::Help => draw_help(frame, area),
        Mode::Prompt(prompt) => draw_prompt(frame, area, prompt),
        Mode::Confirm(confirm) => {
            let lines = vec![
                Line::from(confirm.text.clone()),
                Line::from(""),
                Line::styled("y: yes   any other key: cancel", DIM),
            ];
            draw_box(frame, area, "Confirm", lines);
        }
        _ => {}
    }
}

fn draw_sidebar(state: &State, buf: &mut Buffer, area: Rect) {
    // The last column is the separator; the list uses the rest.
    let width = usize::from(area.width.saturating_sub(1));
    let separator_x = area.x + area.width - 1;
    for y in area.y..area.y + area.height {
        buf[(separator_x, y)].set_symbol("│").set_style(DIM);
    }

    let active_style = Style::default().add_modifier(Modifier::BOLD | Modifier::REVERSED);
    let idle_style = DIM;
    let (workspaces, agents) = match state.view {
        View::Workspaces => (active_style, idle_style),
        View::Agents => (idle_style, active_style),
    };
    let header = Line::from(vec![
        Span::styled(
            format!(" {:<w$}", "Workspaces", w = usize::from(HEADER_SPLIT) - 1),
            workspaces,
        ),
        Span::styled(" Agents ", agents),
    ]);
    buf.set_line(area.x, area.y, &header, width as u16);

    let rows = state.rows();
    let height = usize::from(area.height.saturating_sub(1));
    let index = state
        .cursor
        .and_then(|cursor| rows.iter().position(|row| row.cursor == cursor))
        .unwrap_or(0);
    let start = list_window(rows.len(), index, height);
    if rows.is_empty() {
        let hint = match state.view {
            View::Workspaces => " Ctrl+G P: new project",
            View::Agents => " no agents running",
        };
        buf.set_string(area.x, area.y + 1, fit(hint, width), DIM);
    }
    let active_row = state.active.map(|group| match group {
        crate::state::Group::Workspace(id) => crate::state::Cursor::Workspace(id),
        crate::state::Group::Unassigned => crate::state::Cursor::Unassigned,
    });
    for (line, row) in rows.iter().skip(start).take(height).enumerate() {
        let y = area.y + 1 + line as u16;
        let selected = Some(row.cursor) == state.cursor;
        let mut base = Style::default();
        if selected {
            base = base.add_modifier(Modifier::REVERSED);
        } else if Some(row.cursor) == active_row {
            base = base.add_modifier(Modifier::BOLD);
        }
        buf.set_string(area.x, y, " ".repeat(width), base);
        let indent = " ".repeat(1 + usize::from(row.depth) * 2);
        let mut x = area.x;
        let mut put = |text: &str, style: Style| {
            let room = (area.x as usize + width).saturating_sub(x as usize);
            let text = fit(text, room);
            buf.set_string(x, y, &text, style);
            x += text.width() as u16;
        };
        put(&indent, base);
        match row.status {
            Some(status) => {
                let (glyph, style) = mark(status);
                put(glyph, base.patch(style));
                put(" ", base);
            }
            None => put("▾ ", base),
        }
        put(&row.label, base);
        if !row.detail.is_empty() {
            put("  ", base);
            put(&row.detail, if selected { base } else { base.patch(DIM) });
        }
    }
}

fn draw_tabs(state: &State, buf: &mut Buffer, area: Rect) {
    if area.height == 0 {
        return;
    }
    buf.set_string(
        area.x,
        area.y,
        " ".repeat(usize::from(area.width)),
        Style::default(),
    );
    let visible = state.visible();
    let texts = state.tab_texts();
    for span in tab_spans(&texts, visible, area.x, area.width) {
        let status = state.shell(span.session).map(|s| s.status);
        let selected = Some(span.session) == visible;
        let base = if selected {
            Style::default().add_modifier(Modifier::REVERSED | Modifier::BOLD)
        } else {
            Style::default()
        };
        // The mark keeps its colour inside the tab: the glyph is the second
        // character of the text.
        let mut chars = span.text.chars();
        let lead: String = chars.by_ref().take(1).collect();
        let glyph: String = chars.by_ref().take(1).collect();
        let rest: String = chars.collect();
        let mark_style = status.map(|s| mark(s).1).unwrap_or_default();
        let line = Line::from(vec![
            Span::styled(lead, base),
            Span::styled(glyph, base.patch(mark_style)),
            Span::styled(rest, base),
        ]);
        buf.set_line(span.x, area.y, &line, span.width);
    }
    let behind = state.scrollback();
    if behind > 0 {
        let text = format!(" scrollback -{behind} ");
        let width = text.width() as u16;
        if width < area.width {
            buf.set_string(
                area.x + area.width - width,
                area.y,
                text,
                Style::default()
                    .fg(Color::Yellow)
                    .add_modifier(Modifier::REVERSED),
            );
        }
    }
}

fn draw_terminal(state: &State, frame: &mut Frame, area: Rect) {
    if area.width == 0 || area.height == 0 {
        return;
    }
    let Some(shell) = state.visible().and_then(|id| state.shell(id)) else {
        let text = if state.projects.is_empty() {
            "No project yet. Press Ctrl+G, then P to create one."
        } else if state.active.is_none() && state.rows().iter().all(|row| row.status.is_none()) {
            "No workspace yet. Press Ctrl+G, then w to add one."
        } else if state.active.is_none() {
            "Pick a workspace in the sidebar (Ctrl+G, then j / k)."
        } else {
            "No shell here. Press Ctrl+G, then c to open one."
        };
        let y = area.y + area.height / 2;
        frame.render_widget(
            Paragraph::new(text).style(DIM).alignment(Alignment::Center),
            Rect::new(area.x, y, area.width, 1),
        );
        return;
    };
    let screen = shell.parser.screen();
    let buf = frame.buffer_mut();
    let (rows, cols) = (screen.size().0.get(), screen.size().1.get());
    for row in 0..area.height.min(rows) {
        for col in 0..area.width.min(cols) {
            let Some(cell) = screen.cell(row, col) else {
                continue;
            };
            if cell.is_wide_continuation() {
                continue;
            }
            let target = &mut buf[(area.x + col, area.y + row)];
            let text = cell.contents();
            target.set_symbol(if text.is_empty() { " " } else { text });
            target.set_style(cell_style(cell));
        }
    }
    let covered = matches!(state.mode, Mode::Help | Mode::Prompt(_) | Mode::Confirm(_));
    if !covered && !screen.hide_cursor() && screen.scrollback() == 0 {
        let (row, col) = screen.cursor_position();
        if row < area.height && col < area.width {
            frame.set_cursor_position(Position::new(area.x + col, area.y + row));
        }
    }
}

fn cell_style(cell: &vt100::Cell) -> Style {
    let mut style = Style::default()
        .fg(color(cell.fgcolor()))
        .bg(color(cell.bgcolor()));
    let mut modifiers = Modifier::empty();
    if cell.bold() {
        modifiers |= Modifier::BOLD;
    }
    if cell.dim() {
        modifiers |= Modifier::DIM;
    }
    if cell.italic() {
        modifiers |= Modifier::ITALIC;
    }
    if cell.underline() {
        modifiers |= Modifier::UNDERLINED;
    }
    if cell.inverse() {
        modifiers |= Modifier::REVERSED;
    }
    style = style.add_modifier(modifiers);
    style
}

fn color(color: vt100::Color) -> Color {
    match color {
        vt100::Color::Default => Color::Reset,
        vt100::Color::Idx(index) => Color::Indexed(index),
        vt100::Color::Rgb(r, g, b) => Color::Rgb(r, g, b),
    }
}

fn draw_status(state: &State, buf: &mut Buffer, area: Rect) {
    if area.height == 0 {
        return;
    }
    let width = usize::from(area.width);
    let (label, keys) = match &state.mode {
        Mode::Terminal => (
            " TERMINAL ",
            "Ctrl+G: commands   Ctrl+G ?: help   Ctrl+G q: quit (shells keep running)",
        ),
        Mode::Command => (
            " COMMAND ",
            "c new  x close  n/p tab  j/k row  a view  b sidebar  P project  w workspace  r rename  d delete  q quit  ? help",
        ),
        Mode::Prompt(_) => (" INPUT ", "Enter: next / confirm   Tab: field   Esc: cancel"),
        Mode::Confirm(_) => (" CONFIRM ", "y: yes   any other key: cancel"),
        Mode::Help => (" HELP ", "any key closes"),
    };
    let label_style = match state.mode {
        Mode::Terminal => Style::default().fg(Color::Black).bg(Color::Green),
        _ => Style::default().fg(Color::Black).bg(Color::Yellow),
    }
    .add_modifier(Modifier::BOLD);
    buf.set_string(
        area.x,
        area.y,
        " ".repeat(width),
        Style::default().add_modifier(Modifier::REVERSED),
    );
    buf.set_string(area.x, area.y, label, label_style);
    let rest = width.saturating_sub(label.width() + 1);
    let (text, style) = match &state.notice {
        Some(notice) => (
            notice.as_str(),
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::REVERSED),
        ),
        None => (keys, Style::default().add_modifier(Modifier::REVERSED)),
    };
    buf.set_string(
        area.x + label.width() as u16 + 1,
        area.y,
        fit(text, rest),
        style,
    );
}

/// A bordered box in the middle of the screen, over whatever is there.
fn draw_box(frame: &mut Frame, area: Rect, title: &str, lines: Vec<Line>) -> Rect {
    let inner_width = lines
        .iter()
        .map(|l| l.width())
        .max()
        .unwrap_or(0)
        .max(title.width()) as u16
        + 4;
    let width = inner_width.min(area.width);
    let height = (lines.len() as u16 + 2).min(area.height);
    let rect = Rect::new(
        area.x + (area.width - width) / 2,
        area.y + (area.height - height) / 2,
        width,
        height,
    );
    frame.render_widget(Clear, rect);
    frame.render_widget(
        Paragraph::new(lines).block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" {title} ")),
        ),
        rect,
    );
    rect
}

fn draw_help(frame: &mut Frame, area: Rect) {
    let mut lines = vec![
        Line::styled(
            "Everything typed goes to the shell. Ctrl+G, then one key:",
            DIM,
        ),
        Line::from(""),
    ];
    for (key, meaning) in HELP {
        lines.push(Line::from(vec![
            Span::styled(
                format!("{key:<15}"),
                Style::default().add_modifier(Modifier::BOLD),
            ),
            Span::raw(*meaning),
        ]));
    }
    lines.push(Line::from(""));
    lines.push(Line::styled(
        "Click a sidebar row or a tab to select it.",
        DIM,
    ));
    draw_box(frame, area, "Keys", lines);
}

fn draw_prompt(frame: &mut Frame, area: Rect, prompt: &Prompt) {
    let mut lines = Vec::new();
    for (index, field) in prompt.fields.iter().enumerate() {
        let focused = index == prompt.focus;
        let value = if focused {
            format!("{}▏", field.value)
        } else {
            field.value.clone()
        };
        lines.push(Line::from(vec![
            Span::styled(
                format!("{:<8}", field.label),
                if focused {
                    Style::default().add_modifier(Modifier::BOLD)
                } else {
                    DIM
                },
            ),
            Span::raw(format!("{value:<40}")),
        ]));
    }
    draw_box(frame, area, &prompt.title, lines);
}

#[cfg(test)]
mod tests {
    use super::*;
    use akbun_terminal_core::protocol::SessionInfo;
    use akbun_terminal_core::tree::{Project, TreeState, Workspace, WorkspaceStatus};
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;

    fn info(session: u32, workspace: Option<u64>, status: WorkspaceStatus) -> SessionInfo {
        SessionInfo {
            session,
            name: None,
            parent: None,
            workspace,
            cwd: "/".to_string(),
            cols: 80,
            rows: 24,
            agent: None,
            status,
        }
    }

    fn sample() -> State {
        let mut state = State::new("/home/me");
        state.set_tree(TreeState {
            projects: vec![Project {
                id: 1,
                name: "site".to_string(),
                path: Some("/work/site".to_string()),
                workspaces: vec![
                    Workspace {
                        id: 2,
                        name: "main".to_string(),
                        status: WorkspaceStatus::Idle,
                    },
                    Workspace {
                        id: 3,
                        name: "dev".to_string(),
                        status: WorkspaceStatus::Idle,
                    },
                ],
            }],
            ..TreeState::default()
        });
        state.add_session(
            &info(1, Some(2), WorkspaceStatus::Idle),
            60,
            20,
            &[b"$ echo hi\r\nhi\r\n$ ".to_vec()],
        );
        let mut named = info(2, Some(2), WorkspaceStatus::Running);
        named.name = Some("build".to_string());
        state.add_session(&named, 60, 20, &[]);
        state.add_session(
            &info(3, Some(3), WorkspaceStatus::NeedsAttention),
            60,
            20,
            &[],
        );
        state.add_session(&info(4, None, WorkspaceStatus::Failed), 60, 20, &[]);
        state.init_selection();
        state
    }

    fn draw(state: &State, width: u16, height: u16) -> (Vec<String>, Terminal<TestBackend>) {
        let mut terminal = Terminal::new(TestBackend::new(width, height)).unwrap();
        terminal.draw(|frame| render(state, frame)).unwrap();
        let buffer = terminal.backend().buffer().clone();
        let lines = (0..height)
            .map(|y| {
                (0..width)
                    .map(|x| buffer[(x, y)].symbol().to_string())
                    .collect::<String>()
            })
            .collect();
        (lines, terminal)
    }

    #[test]
    fn the_sidebar_lists_projects_workspaces_and_the_unassigned_group() {
        let mut state = sample();
        state.set_area(Rect::new(0, 0, 100, 20));
        let (lines, _) = draw(&state, 100, 20);
        assert!(lines[0].starts_with(" Workspaces"));
        assert!(lines[0].contains("Agents"));
        assert!(lines[1].contains("▾ site"), "{:?}", lines[1]);
        assert!(
            lines[2].contains("· main") || lines[2].contains("● main"),
            "{:?}",
            lines[2]
        );
        assert!(lines[3].contains("▲ dev"), "{:?}", lines[3]);
        assert!(lines[4].contains("✗ unassigned"), "{:?}", lines[4]);
    }

    #[test]
    fn the_workspace_mark_is_its_most_blocked_shell() {
        let mut state = sample();
        state.set_area(Rect::new(0, 0, 100, 20));
        let (lines, _) = draw(&state, 100, 20);
        // main holds an idle and a running shell.
        assert!(lines[2].contains("● main"), "{:?}", lines[2]);
    }

    #[test]
    fn the_tab_strip_names_shells_and_marks_their_status() {
        let mut state = sample();
        state.set_area(Rect::new(0, 0, 100, 20));
        let (lines, _) = draw(&state, 100, 20);
        let strip: String = lines[0].chars().skip(28).collect();
        assert!(strip.contains("· shell 1"), "{strip:?}");
        assert!(strip.contains("● build"), "{strip:?}");
    }

    #[test]
    fn the_terminal_shows_the_selected_shells_screen() {
        let mut state = sample();
        state.set_area(Rect::new(0, 0, 100, 20));
        let (lines, _) = draw(&state, 100, 20);
        let body: String = lines[1].chars().skip(28).collect();
        assert!(body.starts_with("$ echo hi"), "{body:?}");
        assert!(lines[2]
            .chars()
            .skip(28)
            .collect::<String>()
            .starts_with("hi"));
    }

    #[test]
    fn the_cursor_sits_where_the_shells_cursor_is() {
        let mut state = sample();
        state.set_area(Rect::new(0, 0, 100, 20));
        let (_, mut terminal) = draw(&state, 100, 20);
        let position = terminal.get_cursor_position().unwrap();
        assert_eq!((position.x, position.y), (28 + 2, 1 + 2));
    }

    #[test]
    fn the_status_line_shows_the_mode_and_the_keys() {
        let mut state = sample();
        state.set_area(Rect::new(0, 0, 100, 20));
        let (lines, _) = draw(&state, 100, 20);
        assert!(lines[19].contains("TERMINAL"));
        assert!(lines[19].contains("Ctrl+G: commands"));
        state.mode = Mode::Command;
        let (lines, _) = draw(&state, 100, 20);
        assert!(lines[19].contains("COMMAND"));
        assert!(lines[19].contains("c new"));
    }

    #[test]
    fn the_agents_view_lists_agents_with_their_workspace() {
        let mut state = sample();
        state.set_area(Rect::new(0, 0, 100, 20));
        let mut helper = info(5, Some(3), WorkspaceStatus::Running);
        helper.agent = Some("Claude Code".to_string());
        helper.name = Some("helper".to_string());
        let mut child = info(6, Some(3), WorkspaceStatus::NeedsAttention);
        child.agent = Some("Codex".to_string());
        child.parent = Some(5);
        state.add_session(&helper, 60, 20, &[]);
        state.add_session(&child, 60, 20, &[]);
        state.view = View::Agents;
        state.cursor = None;
        state.reconcile(&[
            info(1, Some(2), WorkspaceStatus::Idle),
            helper.clone(),
            child.clone(),
        ]);
        let (lines, _) = draw(&state, 100, 20);
        assert!(lines[1].contains("● helper"), "{:?}", lines[1]);
        assert!(lines[1].contains("dev"));
        assert!(lines[2].contains("  ▲ Codex"), "{:?}", lines[2]);
    }

    #[test]
    fn an_empty_workspace_says_how_to_open_a_shell() {
        let mut state = State::new("/");
        state.set_tree(TreeState {
            projects: vec![Project {
                id: 1,
                name: "p".to_string(),
                path: None,
                workspaces: vec![Workspace {
                    id: 2,
                    name: "w".to_string(),
                    status: WorkspaceStatus::Idle,
                }],
            }],
            ..TreeState::default()
        });
        state.init_selection();
        let (lines, _) = draw(&state, 100, 20);
        assert!(lines.iter().any(|l| l.contains("Ctrl+G, then c")));
        let empty = State::new("/");
        let (lines, _) = draw(&empty, 100, 20);
        assert!(lines.iter().any(|l| l.contains("Ctrl+G, then P")));
    }

    #[test]
    fn help_and_prompts_draw_over_the_terminal() {
        let mut state = sample();
        state.set_area(Rect::new(0, 0, 100, 30));
        state.mode = Mode::Help;
        let (lines, _) = draw(&state, 100, 30);
        assert!(lines
            .iter()
            .any(|l| l.contains("new tab in this workspace")));
        assert!(lines
            .iter()
            .any(|l| l.contains("quit; the shells keep running")));
        state.mode = Mode::Terminal;
        state.on_key(ratatui::crossterm::event::KeyEvent::new(
            ratatui::crossterm::event::KeyCode::Char('g'),
            ratatui::crossterm::event::KeyModifiers::CONTROL,
        ));
        state.on_key(ratatui::crossterm::event::KeyEvent::new(
            ratatui::crossterm::event::KeyCode::Char('P'),
            ratatui::crossterm::event::KeyModifiers::SHIFT,
        ));
        let (lines, _) = draw(&state, 100, 30);
        assert!(lines.iter().any(|l| l.contains("New project")));
        assert!(lines
            .iter()
            .any(|l| l.contains("Folder") && l.contains("/home/me")));
    }

    #[test]
    fn a_hidden_sidebar_leaves_only_the_tabs_and_the_terminal() {
        let mut state = sample();
        state.sidebar = false;
        state.set_area(Rect::new(0, 0, 100, 20));
        let (lines, _) = draw(&state, 100, 20);
        assert!(!lines[0].contains("Workspaces"));
        assert!(lines[0].contains("shell 1"));
    }
}
