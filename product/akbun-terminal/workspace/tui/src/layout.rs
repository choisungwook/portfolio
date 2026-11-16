//! Where things go on the screen.
//!
//! Drawing and mouse hit-testing both need the same rectangles, so they are
//! computed here once and neither side has its own idea of the geometry.

use ratatui::layout::Rect;
use unicode_width::UnicodeWidthStr;

/// Width of the sidebar including its separator column.
pub const SIDEBAR_WIDTH: u16 = 28;
/// Below this the sidebar would leave no room for a shell, so it hides itself.
const MIN_WIDTH_FOR_SIDEBAR: u16 = 60;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Layout {
    pub sidebar: Rect,
    pub tabs: Rect,
    pub term: Rect,
    pub status: Rect,
}

pub fn layout(area: Rect, sidebar_visible: bool) -> Layout {
    let sidebar_width = if sidebar_visible && area.width >= MIN_WIDTH_FOR_SIDEBAR {
        SIDEBAR_WIDTH
    } else {
        0
    };
    let body = area.height.saturating_sub(1);
    let main_x = area.x + sidebar_width;
    let main_width = area.width - sidebar_width;
    let tab_height = body.min(1);
    Layout {
        sidebar: Rect::new(area.x, area.y, sidebar_width, body),
        tabs: Rect::new(main_x, area.y, main_width, tab_height),
        term: Rect::new(main_x, area.y + tab_height, main_width, body - tab_height),
        status: Rect::new(area.x, area.y + body, area.width, area.height.min(1)),
    }
}

/// The columns and rows a shell gets when the screen is `area`.
pub fn pane_size(area: Rect, sidebar_visible: bool) -> (u16, u16) {
    let term = layout(area, sidebar_visible).term;
    (term.width.max(1), term.height.max(1))
}

/// One tab as laid out in the strip: where it is and what it says.
#[derive(Debug, Clone, PartialEq)]
pub struct TabSpan {
    pub session: u32,
    pub x: u16,
    pub width: u16,
    pub text: String,
}

/// The tabs that fit in `width` columns, scrolled so the selected one is
/// always among them. `labels` are the full texts, one per tab.
pub fn tab_spans(
    labels: &[(u32, String)],
    selected: Option<u32>,
    x0: u16,
    width: u16,
) -> Vec<TabSpan> {
    let widths: Vec<u16> = labels
        .iter()
        .map(|(_, text)| text.width().min(usize::from(u16::MAX)) as u16)
        .collect();
    let selected_index = labels.iter().position(|(id, _)| Some(*id) == selected);
    let mut start = 0;
    if let Some(selected_index) = selected_index {
        while start < selected_index
            && widths[start..=selected_index]
                .iter()
                .map(|w| u32::from(*w))
                .sum::<u32>()
                > u32::from(width)
        {
            start += 1;
        }
    }
    let mut spans = Vec::new();
    let mut x = 0u16;
    for index in start..labels.len() {
        if x + widths[index] > width {
            break;
        }
        spans.push(TabSpan {
            session: labels[index].0,
            x: x0 + x,
            width: widths[index],
            text: labels[index].1.clone(),
        });
        x += widths[index];
    }
    spans
}

/// The first row of the sidebar list to draw, so the cursor row stays visible
/// in `height` rows.
pub fn list_window(len: usize, cursor: usize, height: usize) -> usize {
    if height == 0 || len <= height {
        return 0;
    }
    (cursor + 1).saturating_sub(height).min(len - height)
}

/// `text` cut to `width` columns, with an ellipsis if anything was lost.
pub fn fit(text: &str, width: usize) -> String {
    if text.width() <= width {
        return text.to_string();
    }
    let mut out = String::new();
    let mut used = 0;
    for c in text.chars() {
        let w = unicode_width::UnicodeWidthChar::width(c).unwrap_or(0);
        if used + w + 1 > width {
            break;
        }
        out.push(c);
        used += w;
    }
    if width > 0 {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sidebar_takes_the_left_and_the_status_line_the_bottom() {
        let l = layout(Rect::new(0, 0, 100, 30), true);
        assert_eq!(l.sidebar, Rect::new(0, 0, SIDEBAR_WIDTH, 29));
        assert_eq!(l.tabs, Rect::new(SIDEBAR_WIDTH, 0, 72, 1));
        assert_eq!(l.term, Rect::new(SIDEBAR_WIDTH, 1, 72, 28));
        assert_eq!(l.status, Rect::new(0, 29, 100, 1));
    }

    #[test]
    fn a_hidden_or_cramped_sidebar_gives_everything_to_the_shell() {
        assert_eq!(pane_size(Rect::new(0, 0, 100, 30), false), (100, 28));
        assert_eq!(pane_size(Rect::new(0, 0, 50, 30), true), (50, 28));
    }

    #[test]
    fn tabs_scroll_to_keep_the_selected_one_in_view() {
        let labels: Vec<(u32, String)> = (1..=5).map(|i| (i, format!(" tab {i} "))).collect();
        let spans = tab_spans(&labels, Some(5), 0, 20);
        assert_eq!(spans.last().map(|s| s.session), Some(5));
        assert!(spans.iter().all(|s| s.x + s.width <= 20));
        let spans = tab_spans(&labels, Some(1), 4, 20);
        assert_eq!(spans[0].session, 1);
        assert_eq!(spans[0].x, 4);
    }

    #[test]
    fn the_list_window_follows_the_cursor() {
        assert_eq!(list_window(5, 4, 10), 0);
        assert_eq!(list_window(20, 0, 10), 0);
        assert_eq!(list_window(20, 15, 10), 6);
        assert_eq!(list_window(20, 19, 10), 10);
    }

    #[test]
    fn fit_marks_what_it_cut() {
        assert_eq!(fit("short", 10), "short");
        assert_eq!(fit("a long name", 6), "a lon…");
    }
}
