//! Which keystroke runs which menu command.
//!
//! The list lives here rather than in the menu builder for the same reason the
//! themes do: it is saved with the rest of the state, and a shell that draws the
//! menu should not also be the place that decides what is in it. The shell asks
//! for the commands, draws one item per row and looks the action up by id, so a
//! command added here needs a selector on the other side and nothing else.
//!
//! A shortcut crosses the boundary as a string: `cmd+shift+f`, modifiers first
//! in a fixed order and the key last. It is what a person would type into a
//! settings file, and parsing it is the only part that can be wrong, which is
//! why it is on this side where a test can reach it.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Shortcut {
    /// What the shell matches an action against. Never shown to anyone.
    pub command: String,
    /// The menu item's wording, so the settings window and the menu agree.
    pub title: String,
    /// Which menu the item belongs under, so the settings window can group the
    /// rows the way the menu bar does.
    pub menu: String,
    pub key: String,
    /// What the key was before anyone changed it. Sent so the settings window
    /// can offer "restore" without a second call.
    pub default_key: String,
}

struct Row {
    command: &'static str,
    title: &'static str,
    menu: &'static str,
    key: &'static str,
}

/// Every command a key can be put on, in the order the settings window lists
/// them. This is also the menu bar's own order: one table means the two cannot
/// drift apart.
const ROWS: &[Row] = &[
    Row { command: "new_tab", title: "New Terminal Tab", menu: "File", key: "cmd+t" },
    Row { command: "open_file", title: "Open File…", menu: "File", key: "cmd+o" },
    Row { command: "close_tab", title: "Close Tab", menu: "File", key: "cmd+w" },
    Row { command: "save", title: "Save", menu: "File", key: "cmd+s" },
    Row { command: "edit_mode", title: "Edit Mode", menu: "Edit", key: "cmd+e" },
    Row { command: "find", title: "Find…", menu: "Edit", key: "cmd+f" },
    Row { command: "find_next", title: "Find Next", menu: "Edit", key: "cmd+g" },
    Row { command: "find_previous", title: "Find Previous", menu: "Edit", key: "cmd+shift+g" },
    Row { command: "zoom_in", title: "Bigger", menu: "View", key: "cmd+plus" },
    Row { command: "zoom_out", title: "Smaller", menu: "View", key: "cmd+minus" },
    Row { command: "zoom_reset", title: "Default Size", menu: "View", key: "cmd+0" },
    Row { command: "toggle_file_browser", title: "Hide File Browser", menu: "View", key: "cmd+b" },
];

/// The commands with any saved override applied. Unknown ids in the saved map
/// are ignored rather than reported: a command removed from a later build must
/// not stop the settings window from opening.
pub fn all(overrides: &BTreeMap<String, String>) -> Vec<Shortcut> {
    ROWS.iter()
        .map(|row| Shortcut {
            command: row.command.to_string(),
            title: row.title.to_string(),
            menu: row.menu.to_string(),
            key: overrides
                .get(row.command)
                .cloned()
                .unwrap_or_else(|| row.key.to_string()),
            default_key: row.key.to_string(),
        })
        .collect()
}

pub fn exists(command: &str) -> bool {
    ROWS.iter().any(|row| row.command == command)
}

/// Puts `key` on `command`, or restores the default when `key` is empty.
///
/// A key already on another command is refused rather than quietly taken from
/// it. Two items with one keystroke is not a state anybody chose: AppKit runs
/// whichever it finds first, so the other command becomes dead with nothing on
/// screen to say why.
pub fn set(
    overrides: &BTreeMap<String, String>,
    command: &str,
    key: &str,
) -> Result<BTreeMap<String, String>, String> {
    if !exists(command) {
        return Err(format!("no command named {command}"));
    }
    let mut next = overrides.clone();
    if key.trim().is_empty() {
        next.remove(command);
        return Ok(next);
    }
    let key = canonical(key).ok_or_else(|| format!("{key} is not a shortcut this build reads"))?;
    if let Some(taken) = all(overrides)
        .into_iter()
        .find(|shortcut| shortcut.command != command && shortcut.key == key)
    {
        return Err(format!("{key} is already on {}", taken.title));
    }
    next.insert(command.to_string(), key);
    Ok(next)
}

/// A shortcut written the one way this build writes it: modifiers in a fixed
/// order, everything lowercase, the key last. Nothing else is stored, so two
/// spellings of the same keystroke cannot both sit in the saved map and look
/// like two different shortcuts.
pub fn canonical(key: &str) -> Option<String> {
    let mut command = false;
    let mut control = false;
    let mut option = false;
    let mut shift = false;
    let mut base: Option<String> = None;
    for part in key.split('+') {
        let part = part.trim().to_lowercase();
        if part.is_empty() {
            // "cmd++" is command with the plus key, and splitting on the
            // separator leaves the key itself as an empty part.
            match base.as_deref() {
                None | Some("plus") => base = Some("plus".to_string()),
                Some(_) => return None,
            }
            continue;
        }
        match part.as_str() {
            "cmd" | "command" | "meta" => command = true,
            "ctrl" | "control" => control = true,
            "alt" | "opt" | "option" => option = true,
            "shift" => shift = true,
            _ => {
                if base.is_some() {
                    return None;
                }
                base = Some(normalise(&part)?);
            }
        }
    }
    let base = base?;
    // A bare letter is a keystroke the terminal needs, so a shortcut has to hold
    // something down. Function keys are the exception: nothing types those.
    if !(command || control || option) && !base.starts_with('f') {
        return None;
    }
    let mut text = String::new();
    for (held, name) in [(command, "cmd"), (control, "ctrl"), (option, "alt"), (shift, "shift")] {
        if held {
            text.push_str(name);
            text.push('+');
        }
    }
    text.push_str(&base);
    Some(text)
}

/// The names for keys that are not one character. Anything else is a single
/// character, which is what the shell hands to a menu item as its equivalent.
fn normalise(part: &str) -> Option<String> {
    let named = [
        "plus", "minus", "space", "tab", "return", "escape", "delete", "left", "right", "up",
        "down", "home", "end", "pageup", "pagedown",
    ];
    if named.contains(&part) {
        return Some(part.to_string());
    }
    if part.starts_with('f') && part[1..].parse::<u8>().is_ok_and(|n| (1..=20).contains(&n)) {
        return Some(part.to_string());
    }
    match part {
        "+" | "=" => Some("plus".to_string()),
        "-" | "_" => Some("minus".to_string()),
        _ => {
            let mut characters = part.chars();
            let single = characters.next()?;
            characters.next().is_none().then(|| single.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_defaults_are_the_keys_the_request_asked_for() {
        let shortcuts = all(&BTreeMap::new());
        let key = |command: &str| {
            shortcuts
                .iter()
                .find(|shortcut| shortcut.command == command)
                .map(|shortcut| shortcut.key.clone())
                .unwrap()
        };
        assert_eq!(key("close_tab"), "cmd+w");
        assert_eq!(key("save"), "cmd+s");
        assert_eq!(key("find"), "cmd+f");
        assert_eq!(key("open_file"), "cmd+o");
        // Every default has to survive its own parser, or the settings window
        // would open showing a row it cannot save again.
        for shortcut in &shortcuts {
            assert_eq!(canonical(&shortcut.key).as_deref(), Some(shortcut.key.as_str()));
        }
    }

    #[test]
    fn an_override_replaces_one_row_and_leaves_the_rest() {
        let overrides = set(&BTreeMap::new(), "save", "CMD+SHIFT+S").unwrap();
        let shortcuts = all(&overrides);
        let save = shortcuts.iter().find(|item| item.command == "save").unwrap();
        assert_eq!(save.key, "cmd+shift+s");
        assert_eq!(save.default_key, "cmd+s");
        assert_eq!(
            shortcuts.iter().find(|item| item.command == "find").unwrap().key,
            "cmd+f"
        );
    }

    #[test]
    fn an_empty_key_restores_the_default() {
        let overrides = set(&BTreeMap::new(), "find", "cmd+alt+f").unwrap();
        let restored = set(&overrides, "find", "").unwrap();
        assert!(restored.is_empty());
        assert_eq!(
            all(&restored).iter().find(|item| item.command == "find").unwrap().key,
            "cmd+f"
        );
    }

    #[test]
    fn a_key_already_in_use_is_refused() {
        // AppKit runs whichever item it finds first, so the other command would
        // go dead with nothing on screen to say why.
        let error = set(&BTreeMap::new(), "save", "cmd+w").unwrap_err();
        assert!(error.contains("Close Tab"), "{error}");
        // Keeping a command on the key it already has is not a clash with itself.
        assert!(set(&BTreeMap::new(), "save", "cmd+s").is_ok());
    }

    #[test]
    fn a_shortcut_has_to_hold_something_down() {
        // A bare letter belongs to the shell in the middle of the window.
        assert_eq!(canonical("k"), None);
        assert_eq!(canonical("shift+k"), None);
        assert_eq!(canonical("f5").as_deref(), Some("f5"));
        assert_eq!(canonical("cmd+k").as_deref(), Some("cmd+k"));
    }

    #[test]
    fn one_keystroke_has_one_spelling() {
        assert_eq!(canonical("command+K").as_deref(), Some("cmd+k"));
        assert_eq!(canonical("shift+cmd+k").as_deref(), Some("cmd+shift+k"));
        assert_eq!(canonical("cmd+=").as_deref(), Some("cmd+plus"));
        assert_eq!(canonical("cmd++").as_deref(), Some("cmd+plus"));
        assert_eq!(canonical("ctrl+opt+Left").as_deref(), Some("ctrl+alt+left"));
        assert_eq!(canonical("cmd+a+b"), None);
        assert_eq!(canonical("cmd"), None);
    }

    #[test]
    fn an_unknown_command_is_refused_and_a_forgotten_one_is_ignored() {
        assert!(set(&BTreeMap::new(), "fly", "cmd+k").is_err());
        let mut saved = BTreeMap::new();
        saved.insert("removed_in_a_later_build".to_string(), "cmd+k".to_string());
        assert_eq!(all(&saved).len(), ROWS.len());
    }
}
