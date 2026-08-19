//! What a session currently shows, kept as a grid of characters.
//!
//! Agent state has to be read from the screen, and an agent redraws its own
//! output constantly: a question is printed, answered and painted over in the
//! same second. Searching the raw byte stream would keep finding the question
//! long after it was answered, so the bytes are interpreted first and the search
//! runs over what a person would actually see.
//!
//! Only the movements that change where a character lands are implemented.
//! Colours, fonts and every other attribute are dropped, because nothing above
//! this file asks about them.

use vte::{Params, Parser, Perform};

pub struct Screen {
    parser: Parser,
    grid: Grid,
}

impl Screen {
    pub fn new(cols: u16, rows: u16) -> Self {
        Self {
            parser: Parser::new(),
            grid: Grid::new(cols, rows),
        }
    }

    pub fn feed(&mut self, bytes: &[u8]) {
        self.parser.advance(&mut self.grid, bytes);
    }

    /// A new size starts from a blank screen. The program on the other side
    /// redraws after a resize anyway, so carrying the old contents across only
    /// risks reading half of one layout and half of another.
    pub fn resize(&mut self, cols: u16, rows: u16) {
        self.grid = Grid::new(cols, rows);
    }

    /// The visible text, one row per line and trailing blanks removed.
    pub fn text(&self) -> String {
        self.grid
            .cells
            .iter()
            .map(|row| {
                let line: String = row.iter().collect();
                line.trim_end().to_string()
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

struct Grid {
    cols: usize,
    rows: usize,
    cells: Vec<Vec<char>>,
    row: usize,
    col: usize,
}

impl Grid {
    fn new(cols: u16, rows: u16) -> Self {
        let cols = (cols as usize).max(1);
        let rows = (rows as usize).max(1);
        Self {
            cols,
            rows,
            cells: vec![vec![' '; cols]; rows],
            row: 0,
            col: 0,
        }
    }

    fn newline(&mut self) {
        if self.row + 1 < self.rows {
            self.row += 1;
            return;
        }
        self.cells.remove(0);
        self.cells.push(vec![' '; self.cols]);
    }

    fn blank(&mut self, row: usize, from: usize, to: usize) {
        let Some(line) = self.cells.get_mut(row) else {
            return;
        };
        for column in from..to.min(line.len()) {
            line[column] = ' ';
        }
    }

    fn first(params: &Params, default: usize) -> usize {
        params
            .iter()
            .next()
            .and_then(|values| values.first().copied())
            .filter(|value| *value != 0)
            .map(|value| value as usize)
            .unwrap_or(default)
    }

    fn nth(params: &Params, index: usize, default: usize) -> usize {
        params
            .iter()
            .nth(index)
            .and_then(|values| values.first().copied())
            .filter(|value| *value != 0)
            .map(|value| value as usize)
            .unwrap_or(default)
    }
}

impl Perform for Grid {
    fn print(&mut self, character: char) {
        if self.col >= self.cols {
            self.col = 0;
            self.newline();
        }
        self.cells[self.row][self.col] = character;
        self.col += 1;
    }

    fn execute(&mut self, byte: u8) {
        match byte {
            b'\n' | 0x0b | 0x0c => self.newline(),
            b'\r' => self.col = 0,
            0x08 => self.col = self.col.saturating_sub(1),
            b'\t' => self.col = ((self.col / 8) + 1) * 8,
            _ => {}
        }
        self.col = self.col.min(self.cols.saturating_sub(1));
    }

    fn csi_dispatch(&mut self, params: &Params, _intermediates: &[u8], _ignore: bool, action: char) {
        match action {
            'A' => self.row = self.row.saturating_sub(Grid::first(params, 1)),
            'B' | 'e' => self.row = (self.row + Grid::first(params, 1)).min(self.rows - 1),
            'C' | 'a' => self.col = (self.col + Grid::first(params, 1)).min(self.cols - 1),
            'D' => self.col = self.col.saturating_sub(Grid::first(params, 1)),
            'G' | '`' => self.col = (Grid::first(params, 1) - 1).min(self.cols - 1),
            'd' => self.row = (Grid::first(params, 1) - 1).min(self.rows - 1),
            'H' | 'f' => {
                self.row = (Grid::first(params, 1) - 1).min(self.rows - 1);
                self.col = (Grid::nth(params, 1, 1) - 1).min(self.cols - 1);
            }
            // Erase display: to the end, to the start, or all of it.
            'J' => {
                let (row, col, rows, cols) = (self.row, self.col, self.rows, self.cols);
                match Grid::first(params, 0).min(2) {
                    0 => {
                        self.blank(row, col, cols);
                        for line in row + 1..rows {
                            self.blank(line, 0, cols);
                        }
                    }
                    1 => {
                        for line in 0..row {
                            self.blank(line, 0, cols);
                        }
                        self.blank(row, 0, col + 1);
                    }
                    _ => {
                        for line in 0..rows {
                            self.blank(line, 0, cols);
                        }
                    }
                }
            }
            'K' => {
                let (row, col, cols) = (self.row, self.col, self.cols);
                match Grid::first(params, 0).min(2) {
                    0 => self.blank(row, col, cols),
                    1 => self.blank(row, 0, col + 1),
                    _ => self.blank(row, 0, cols),
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen(bytes: &[u8]) -> String {
        let mut screen = Screen::new(20, 4);
        screen.feed(bytes);
        screen.text()
    }

    #[test]
    fn keeps_what_is_on_screen_and_not_what_was_written() {
        // The case detection exists for: a question is asked, answered, and the
        // line is painted over. Searching the byte stream would still find it.
        let text = screen(b"Do you want to?\r\x1b[KDone.\r\n");
        assert!(text.starts_with("Done."), "{text:?}");
        assert!(!text.contains("Do you want to"), "{text:?}");
    }

    #[test]
    fn a_full_redraw_leaves_only_the_new_frame() {
        let text = screen(b"esc to interrupt\x1b[2J\x1b[H? for shortcuts");
        assert!(text.contains("? for shortcuts"), "{text:?}");
        assert!(!text.contains("esc to interrupt"), "{text:?}");
    }

    #[test]
    fn addresses_a_cell_and_wraps_at_the_edge() {
        let mut screen = Screen::new(5, 3);
        screen.feed(b"\x1b[2;3Hxy");
        assert_eq!(screen.text(), "\n  xy\n");

        let mut narrow = Screen::new(3, 2);
        narrow.feed(b"abcde");
        assert_eq!(narrow.text(), "abc\nde");
    }

    #[test]
    fn scrolls_when_the_last_row_runs_out() {
        let mut screen = Screen::new(8, 2);
        screen.feed(b"one\r\ntwo\r\nthree");
        assert_eq!(screen.text(), "two\nthree");
    }

    #[test]
    fn colours_and_unknown_sequences_do_not_reach_the_grid() {
        assert_eq!(screen(b"\x1b[31mred\x1b[0m\x1b]0;title\x07"), "red\n\n\n");
    }
}
