//! What a key press means to the program in the shell.
//!
//! A pure function from the key to the bytes a terminal would have sent, so
//! the table is tested without a terminal. The only thing it needs from the
//! screen is whether the program asked for application cursor keys, because
//! arrows and home/end change spelling with that mode.

use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers};

const ESC: u8 = 0x1b;

/// The bytes for `key`, or `None` for a key that sends nothing (a release, a
/// bare modifier, a function key past F12).
pub fn encode_key(key: KeyEvent, application_cursor: bool) -> Option<Vec<u8>> {
    if key.kind == KeyEventKind::Release {
        return None;
    }
    let shift = key.modifiers.contains(KeyModifiers::SHIFT);
    let alt = key.modifiers.contains(KeyModifiers::ALT);
    let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
    // The xterm modifier parameter: 1 plus shift, alt and ctrl as bits.
    let param = 1 + u8::from(shift) + 2 * u8::from(alt) + 4 * u8::from(ctrl);

    let cursor = |letter: char| -> Vec<u8> {
        if param > 1 {
            format!("\x1b[1;{param}{letter}").into_bytes()
        } else if application_cursor {
            format!("\x1bO{letter}").into_bytes()
        } else {
            format!("\x1b[{letter}").into_bytes()
        }
    };
    let tilde = |number: u8| -> Vec<u8> {
        if param > 1 {
            format!("\x1b[{number};{param}~").into_bytes()
        } else {
            format!("\x1b[{number}~").into_bytes()
        }
    };
    // Alt on a key that has no modifier parameter is sent as an escape in front.
    let meta = |mut bytes: Vec<u8>| -> Vec<u8> {
        if alt {
            bytes.insert(0, ESC);
        }
        bytes
    };

    let bytes = match key.code {
        KeyCode::Char(c) => {
            if ctrl {
                match control_byte(c) {
                    Some(byte) => meta(vec![byte]),
                    None => meta(c.to_string().into_bytes()),
                }
            } else {
                meta(c.to_string().into_bytes())
            }
        }
        KeyCode::Enter => meta(vec![b'\r']),
        KeyCode::Tab => meta(vec![b'\t']),
        KeyCode::BackTab => b"\x1b[Z".to_vec(),
        KeyCode::Backspace => meta(vec![if ctrl { 0x08 } else { 0x7f }]),
        KeyCode::Esc => meta(vec![ESC]),
        KeyCode::Up => cursor('A'),
        KeyCode::Down => cursor('B'),
        KeyCode::Right => cursor('C'),
        KeyCode::Left => cursor('D'),
        KeyCode::Home => cursor('H'),
        KeyCode::End => cursor('F'),
        KeyCode::Insert => tilde(2),
        KeyCode::Delete => tilde(3),
        KeyCode::PageUp => tilde(5),
        KeyCode::PageDown => tilde(6),
        KeyCode::F(n @ 1..=4) => {
            let letter = (b'P' + n - 1) as char;
            if param > 1 {
                format!("\x1b[1;{param}{letter}").into_bytes()
            } else {
                format!("\x1bO{letter}").into_bytes()
            }
        }
        KeyCode::F(n @ 5..=12) => tilde([15, 17, 18, 19, 20, 21, 23, 24][usize::from(n - 5)]),
        _ => return None,
    };
    Some(bytes)
}

/// The control character for Ctrl plus `c`.
fn control_byte(c: char) -> Option<u8> {
    match c {
        'a'..='z' => Some(c as u8 - b'a' + 1),
        'A'..='Z' => Some(c as u8 - b'A' + 1),
        ' ' | '@' => Some(0),
        '[' => Some(0x1b),
        '\\' => Some(0x1c),
        ']' => Some(0x1d),
        '^' => Some(0x1e),
        '_' | '/' => Some(0x1f),
        '?' => Some(0x7f),
        _ => None,
    }
}

/// A paste as the program wants it: wrapped in the bracketed paste markers if
/// it turned them on, otherwise as plain input with newlines as returns, which
/// is what pressing them would have sent.
pub fn encode_paste(text: &str, bracketed: bool) -> Vec<u8> {
    if bracketed {
        let mut bytes = b"\x1b[200~".to_vec();
        bytes.extend_from_slice(text.as_bytes());
        bytes.extend_from_slice(b"\x1b[201~");
        bytes
    } else {
        text.replace("\r\n", "\r").replace('\n', "\r").into_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(code: KeyCode, modifiers: KeyModifiers) -> KeyEvent {
        KeyEvent::new(code, modifiers)
    }

    fn encode(code: KeyCode, modifiers: KeyModifiers) -> Vec<u8> {
        encode_key(key(code, modifiers), false).expect("sends bytes")
    }

    const NONE: KeyModifiers = KeyModifiers::NONE;

    #[test]
    fn printable_characters_are_utf8() {
        assert_eq!(encode(KeyCode::Char('a'), NONE), b"a");
        assert_eq!(encode(KeyCode::Char('A'), KeyModifiers::SHIFT), b"A");
        assert_eq!(encode(KeyCode::Char('한'), NONE), "한".as_bytes());
    }

    #[test]
    fn control_letters_become_control_codes() {
        assert_eq!(encode(KeyCode::Char('c'), KeyModifiers::CONTROL), [3]);
        assert_eq!(encode(KeyCode::Char('d'), KeyModifiers::CONTROL), [4]);
        assert_eq!(encode(KeyCode::Char('z'), KeyModifiers::CONTROL), [26]);
        assert_eq!(encode(KeyCode::Char('g'), KeyModifiers::CONTROL), [7]);
        assert_eq!(encode(KeyCode::Char(' '), KeyModifiers::CONTROL), [0]);
        assert_eq!(encode(KeyCode::Char('['), KeyModifiers::CONTROL), [0x1b]);
        assert_eq!(encode(KeyCode::Char('\\'), KeyModifiers::CONTROL), [0x1c]);
    }

    #[test]
    fn alt_puts_an_escape_in_front() {
        assert_eq!(encode(KeyCode::Char('b'), KeyModifiers::ALT), b"\x1bb");
        assert_eq!(encode(KeyCode::Backspace, KeyModifiers::ALT), b"\x1b\x7f");
        assert_eq!(encode(KeyCode::Enter, KeyModifiers::ALT), b"\x1b\r");
        let both = KeyModifiers::ALT | KeyModifiers::CONTROL;
        assert_eq!(encode(KeyCode::Char('a'), both), [0x1b, 1]);
    }

    #[test]
    fn editing_keys() {
        assert_eq!(encode(KeyCode::Enter, NONE), b"\r");
        assert_eq!(encode(KeyCode::Tab, NONE), b"\t");
        assert_eq!(encode(KeyCode::BackTab, KeyModifiers::SHIFT), b"\x1b[Z");
        assert_eq!(encode(KeyCode::Backspace, NONE), [0x7f]);
        assert_eq!(encode(KeyCode::Esc, NONE), [0x1b]);
        assert_eq!(encode(KeyCode::Delete, NONE), b"\x1b[3~");
        assert_eq!(encode(KeyCode::Insert, NONE), b"\x1b[2~");
    }

    #[test]
    fn arrows_follow_application_cursor_mode() {
        let up = key(KeyCode::Up, NONE);
        assert_eq!(encode_key(up, false).unwrap(), b"\x1b[A");
        assert_eq!(encode_key(up, true).unwrap(), b"\x1bOA");
        let home = key(KeyCode::Home, NONE);
        assert_eq!(encode_key(home, false).unwrap(), b"\x1b[H");
        assert_eq!(encode_key(home, true).unwrap(), b"\x1bOH");
        assert_eq!(encode(KeyCode::End, NONE), b"\x1b[F");
    }

    #[test]
    fn modified_arrows_use_the_parameter_form_in_both_modes() {
        let ctrl_left = key(KeyCode::Left, KeyModifiers::CONTROL);
        assert_eq!(encode_key(ctrl_left, false).unwrap(), b"\x1b[1;5D");
        assert_eq!(encode_key(ctrl_left, true).unwrap(), b"\x1b[1;5D");
        assert_eq!(encode(KeyCode::Right, KeyModifiers::SHIFT), b"\x1b[1;2C");
        assert_eq!(encode(KeyCode::Up, KeyModifiers::ALT), b"\x1b[1;3A");
    }

    #[test]
    fn paging_keys() {
        assert_eq!(encode(KeyCode::PageUp, NONE), b"\x1b[5~");
        assert_eq!(encode(KeyCode::PageDown, NONE), b"\x1b[6~");
        assert_eq!(encode(KeyCode::PageUp, KeyModifiers::CONTROL), b"\x1b[5;5~");
    }

    #[test]
    fn function_keys() {
        assert_eq!(encode(KeyCode::F(1), NONE), b"\x1bOP");
        assert_eq!(encode(KeyCode::F(4), NONE), b"\x1bOS");
        assert_eq!(encode(KeyCode::F(5), NONE), b"\x1b[15~");
        assert_eq!(encode(KeyCode::F(10), NONE), b"\x1b[21~");
        assert_eq!(encode(KeyCode::F(12), NONE), b"\x1b[24~");
        assert_eq!(encode(KeyCode::F(2), KeyModifiers::SHIFT), b"\x1b[1;2Q");
        assert_eq!(encode_key(key(KeyCode::F(13), NONE), false), None);
    }

    #[test]
    fn releases_and_bare_modifiers_send_nothing() {
        let mut release = key(KeyCode::Char('a'), NONE);
        release.kind = KeyEventKind::Release;
        assert_eq!(encode_key(release, false), None);
        assert_eq!(encode_key(key(KeyCode::Null, NONE), false), None);
    }

    #[test]
    fn paste_is_bracketed_only_when_the_program_asked() {
        assert_eq!(encode_paste("a\nb", true), b"\x1b[200~a\nb\x1b[201~");
        assert_eq!(encode_paste("a\r\nb\nc", false), b"a\rb\rc");
    }
}
