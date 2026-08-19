//! The colour schemes a terminal can wear.
//!
//! These are the widely known palettes, the same names ghostty ships, carried as
//! data rather than code so adding one is a row in a table. They live in the
//! core because the chosen name is saved with the rest of the state, and because
//! a second shell should show the same colours as this one.
//!
//! Colours cross the boundary as `#rrggbb`. It is what every published scheme is
//! already written in, so a new row can be pasted from its source.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Theme {
    pub name: String,
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    /// The sixteen ANSI colours, dark eight first.
    pub palette: Vec<String>,
}

/// Chosen when nothing is saved. The system appearance decides, which is the
/// only option that follows dark and light mode on its own.
pub const SYSTEM: &str = "System";

struct Row {
    name: &'static str,
    background: &'static str,
    foreground: &'static str,
    cursor: &'static str,
    palette: [&'static str; 16],
}

const ROWS: &[Row] = &[
    Row {
        name: "Dracula",
        background: "#282a36",
        foreground: "#f8f8f2",
        cursor: "#f8f8f2",
        palette: [
            "#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2",
            "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff",
        ],
    },
    Row {
        name: "Nord",
        background: "#2e3440",
        foreground: "#d8dee9",
        cursor: "#d8dee9",
        palette: [
            "#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0",
            "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4",
        ],
    },
    Row {
        name: "Solarized Dark",
        background: "#002b36",
        foreground: "#839496",
        cursor: "#93a1a1",
        palette: [
            "#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5",
            "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
        ],
    },
    Row {
        name: "Solarized Light",
        background: "#fdf6e3",
        foreground: "#657b83",
        cursor: "#586e75",
        palette: [
            "#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5",
            "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
        ],
    },
    Row {
        name: "Gruvbox Dark",
        background: "#282828",
        foreground: "#ebdbb2",
        cursor: "#ebdbb2",
        palette: [
            "#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#a89984",
            "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2",
        ],
    },
    Row {
        name: "Tokyo Night",
        background: "#1a1b26",
        foreground: "#c0caf5",
        cursor: "#c0caf5",
        palette: [
            "#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
            "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
        ],
    },
    Row {
        name: "Catppuccin Mocha",
        background: "#1e1e2e",
        foreground: "#cdd6f4",
        cursor: "#f5e0dc",
        palette: [
            "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
            "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
        ],
    },
    Row {
        name: "One Dark",
        background: "#282c34",
        foreground: "#abb2bf",
        cursor: "#528bff",
        palette: [
            "#282c34", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
            "#5c6370", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#ffffff",
        ],
    },
    Row {
        name: "Monokai",
        background: "#272822",
        foreground: "#f8f8f2",
        cursor: "#f8f8f2",
        palette: [
            "#272822", "#f92672", "#a6e22e", "#f4bf75", "#66d9ef", "#ae81ff", "#a1efe4", "#f8f8f2",
            "#75715e", "#f92672", "#a6e22e", "#f4bf75", "#66d9ef", "#ae81ff", "#a1efe4", "#f9f8f5",
        ],
    },
    Row {
        name: "Ayu Dark",
        background: "#0f1419",
        foreground: "#e6e1cf",
        cursor: "#f29718",
        palette: [
            "#000000", "#ff3333", "#b8cc52", "#e7c547", "#36a3d9", "#f07178", "#95e6cb", "#ffffff",
            "#323232", "#ff6565", "#eafe84", "#fff779", "#68d5ff", "#ffa3aa", "#c7fffd", "#ffffff",
        ],
    },
    Row {
        name: "Rosé Pine",
        background: "#191724",
        foreground: "#e0def4",
        cursor: "#e0def4",
        palette: [
            "#26233a", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
            "#6e6a86", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
        ],
    },
    Row {
        name: "GitHub Light",
        background: "#ffffff",
        foreground: "#24292e",
        cursor: "#24292e",
        palette: [
            "#24292e", "#d73a49", "#28a745", "#dbab09", "#0366d6", "#5a32a3", "#0598bc", "#6a737d",
            "#959da5", "#cb2431", "#22863a", "#b08800", "#005cc8", "#5a32a3", "#3192aa", "#d1d5da",
        ],
    },
];

/// Every theme by name. The system default is not in here: it has no colours of
/// its own, and the shell already knows how to ask the appearance for them.
pub fn all() -> Vec<Theme> {
    ROWS.iter()
        .map(|row| Theme {
            name: row.name.to_string(),
            background: row.background.to_string(),
            foreground: row.foreground.to_string(),
            cursor: row.cursor.to_string(),
            palette: row.palette.iter().map(|color| color.to_string()).collect(),
        })
        .collect()
}

pub fn exists(name: &str) -> bool {
    name == SYSTEM || ROWS.iter().any(|row| row.name == name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_hex(color: &str) -> bool {
        color.len() == 7
            && color.starts_with('#')
            && color[1..].chars().all(|digit| digit.is_ascii_hexdigit())
    }

    #[test]
    fn every_theme_is_complete_and_readable_by_the_shell() {
        // The shell parses these strings and silently falls back on anything it
        // cannot read, so a typo would show up as a theme that does nothing.
        let themes = all();
        assert!(themes.len() >= 10);
        for theme in themes {
            assert_eq!(theme.palette.len(), 16, "{}", theme.name);
            for color in [&theme.background, &theme.foreground, &theme.cursor]
                .into_iter()
                .chain(theme.palette.iter())
            {
                assert!(is_hex(color), "{} has {color}", theme.name);
            }
        }
    }

    #[test]
    fn the_system_default_is_a_name_the_core_accepts() {
        assert!(exists(SYSTEM));
        assert!(exists("Dracula"));
        assert!(!exists("Not A Theme"));
    }
}
