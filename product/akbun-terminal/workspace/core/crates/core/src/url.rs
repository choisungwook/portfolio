//! Finding the URL under a click, and deciding whether it may be opened.
//!
//! The rule lives here rather than in the terminal view for two reasons. The
//! view is expected to be replaced and this is not, and handing a string
//! straight from a terminal to the system opener is how a line of shell output
//! ends up launching something that is not a browser. Nothing leaves this file
//! that is not http or https.

/// Everything a URL may not end on when it sits in a sentence. Brackets are
/// stripped only when they are unbalanced, because a closing one can belong to
/// the URL.
const TRAILING: [char; 10] = ['.', ',', ';', ':', '!', '?', '\'', '"', '>', '\u{2019}'];

/// The URL covering `column` on `line`, or nothing when that character is not
/// part of one.
pub fn at(line: &str, column: usize) -> Option<String> {
    let characters: Vec<char> = line.chars().collect();
    if column >= characters.len() || characters[column].is_whitespace() {
        return None;
    }
    let start = characters[..column]
        .iter()
        .rposition(|character| is_break(*character))
        .map(|index| index + 1)
        .unwrap_or(0);
    let end = characters[column..]
        .iter()
        .position(|character| is_break(*character))
        .map(|index| column + index)
        .unwrap_or(characters.len());

    let word: String = characters[start..end].iter().collect();
    let candidate = trim_punctuation(&word);
    is_openable(candidate).then(|| candidate.to_string())
}

/// Whether a string may be handed to a browser. Only http and https, and only
/// with a host after the scheme.
pub fn is_openable(url: &str) -> bool {
    let Some(rest) = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
    else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    !host.is_empty() && !host.contains(char::is_whitespace)
}

fn is_break(character: char) -> bool {
    character.is_whitespace() || character == '\u{0}' || character == '<' || character == '`'
}

fn trim_punctuation(word: &str) -> &str {
    let mut candidate = word.trim_start_matches(['(', '[', '{', '"', '\'']);
    loop {
        let mut shorter = candidate.trim_end_matches(TRAILING);
        // A closing bracket is part of the URL when the URL opened it, which is
        // how wiki links survive being quoted in a sentence.
        if shorter.ends_with(')') && count(shorter, ')') > count(shorter, '(') {
            shorter = &shorter[..shorter.len() - 1];
        }
        if shorter.len() == candidate.len() {
            return shorter;
        }
        candidate = shorter;
    }
}

fn count(text: &str, character: char) -> usize {
    text.chars().filter(|found| *found == character).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_url_the_click_landed_in() {
        let line = "see https://example.com/a?b=1 for more";
        assert_eq!(at(line, 4).as_deref(), Some("https://example.com/a?b=1"));
        assert_eq!(at(line, 20).as_deref(), Some("https://example.com/a?b=1"));
        assert_eq!(at(line, 0), None);
        assert_eq!(at(line, 3), None);
        assert_eq!(at(line, 500), None);
    }

    #[test]
    fn leaves_the_sentence_out_and_the_url_in() {
        assert_eq!(
            at("open https://example.com/docs.", 10).as_deref(),
            Some("https://example.com/docs")
        );
        assert_eq!(
            at("(https://example.com/a_(b))", 5).as_deref(),
            Some("https://example.com/a_(b)")
        );
        assert_eq!(
            at("<https://example.com/x>", 5).as_deref(),
            Some("https://example.com/x")
        );
    }

    #[test]
    fn refuses_anything_that_is_not_the_web() {
        // The reason this check exists: a terminal prints all of these, and the
        // system opener would happily act on every one.
        for text in [
            "file:///etc/passwd",
            "ssh://box",
            "x-man-page://ls",
            "javascript:alert(1)",
            "https://",
            "example.com",
        ] {
            assert!(!is_openable(text), "{text}");
            assert_eq!(at(text, 1), None, "{text}");
        }
        assert!(is_openable("http://localhost:3000/"));
    }
}
