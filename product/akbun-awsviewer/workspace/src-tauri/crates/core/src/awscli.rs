//! Driving `aws sso login` and reading what it prints.
//!
//! The app no longer runs the device authorization flow itself. It runs the
//! AWS CLI, which does, and relays the browser-interactive step into an app
//! window. Everything here is pure text and argument handling so it can be
//! tested without spawning a process; the spawning lives in the app crate.

/// The verification page the CLI is waiting on, pulled out of its output.
#[derive(Debug, Clone, PartialEq)]
pub struct Verification {
    pub url: String,
    /// Present in most CLI versions. The URL alone is enough to finish the
    /// flow, so a missing code is not a failure.
    pub user_code: Option<String>,
}

/// `--no-browser` is what turns the CLI into something this app can relay:
/// it prints the verification URL and waits instead of opening the OS
/// browser, which would drop the user into another app with no way for this
/// one to know whether they finished.
pub fn login_args(profile: &str) -> Vec<String> {
    vec![
        "sso".to_string(),
        "login".to_string(),
        "--profile".to_string(),
        profile.to_string(),
        "--no-browser".to_string(),
    ]
}

/// Where the AWS CLI v2 installer and Homebrew put `aws`, in that order.
///
/// A macOS GUI app inherits a minimal PATH that has neither directory in it,
/// so looking the name up in PATH alone finds nothing in a bundled build even
/// though the same command works in the user's terminal.
pub const CLI_CANDIDATES: [&str; 3] = ["/usr/local/bin/aws", "/opt/homebrew/bin/aws", "/usr/bin/aws"];

/// Reads the verification page out of whatever the CLI has printed so far.
///
/// Deliberately shape-agnostic: the wording around the URL has changed
/// between CLI versions, so this takes the first https URL and the first
/// user code anywhere in the text rather than matching a sentence. Returns
/// None while the output has no URL yet, which is the normal state for the
/// first lines.
pub fn parse_verification(text: &str) -> Option<Verification> {
    let url = find_url(text)?;
    // The autofill URL carries the code as a query parameter, so a code is
    // usually available even when the CLI printed no separate line for it.
    let user_code = user_code_in(&url).or_else(|| find_user_code(text));
    Some(Verification { url, user_code })
}

fn find_url(text: &str) -> Option<String> {
    text.split_whitespace()
        .find_map(|token| token.find("https://").map(|at| &token[at..]))
        .map(trim_trailing_punctuation)
        .map(str::to_string)
}

/// Terminal output ends URLs with a period or wraps them in parentheses; the
/// opening half of a wrap is dropped by starting the slice at the scheme.
fn trim_trailing_punctuation(token: &str) -> &str {
    token.trim_end_matches(|c| matches!(c, '.' | ',' | ')' | ']' | '>' | '"' | '\''))
}

fn user_code_in(url: &str) -> Option<String> {
    let (_, rest) = url.split_once("user_code=")?;
    let code: String = rest
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    is_user_code(&code).then_some(code)
}

/// Codes look like ABCD-EFGH. Scanning for the shape rather than a label
/// keeps this working whatever sentence the CLI wraps around it.
fn find_user_code(text: &str) -> Option<String> {
    text.split(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
        .find(|token| is_user_code(token))
        .map(str::to_string)
}

fn is_user_code(token: &str) -> bool {
    let Some((left, right)) = token.split_once('-') else {
        return false;
    };
    let block = |part: &str| {
        part.len() == 4 && part.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    };
    block(left) && block(right)
}

/// The last lines of CLI output, for an error message. A failed
/// `aws sso login` explains itself on stderr and that explanation is the only
/// useful thing to show; the whole buffer would be a wall of text.
pub fn error_tail(output: &str, lines: usize) -> String {
    let kept: Vec<&str> = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let start = kept.len().saturating_sub(lines);
    kept[start..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real output from AWS CLI v2.15 with --no-browser.
    const NO_BROWSER: &str = "\
Attempting to automatically open the SSO authorization page in your default browser.
If the browser does not open or you wish to use a different device to authorize this request, open the following URL:

https://device.sso.us-east-1.amazonaws.com/

Then enter the code:

ABCD-EFGH
";

    // Newer wording, where the code only exists inside the autofill URL.
    const AUTOFILL: &str = "\
Browser will not be opened automatically. Open the following URL in a browser:
https://d-90000000.awsapps.com/start/#/device?user_code=WXYZ-1234
";

    #[test]
    fn login_args_pin_the_profile_and_keep_the_browser_closed() {
        assert_eq!(
            login_args("prod"),
            vec!["sso", "login", "--profile", "prod", "--no-browser"]
        );
    }

    #[test]
    fn reads_url_and_code_from_separate_lines() {
        let found = parse_verification(NO_BROWSER).unwrap();
        assert_eq!(found.url, "https://device.sso.us-east-1.amazonaws.com/");
        assert_eq!(found.user_code.as_deref(), Some("ABCD-EFGH"));
    }

    #[test]
    fn reads_code_out_of_the_autofill_url() {
        let found = parse_verification(AUTOFILL).unwrap();
        assert_eq!(
            found.url,
            "https://d-90000000.awsapps.com/start/#/device?user_code=WXYZ-1234"
        );
        assert_eq!(found.user_code.as_deref(), Some("WXYZ-1234"));
    }

    #[test]
    fn a_url_without_a_code_is_still_enough_to_relay() {
        let found = parse_verification("open https://example.com/device to continue").unwrap();
        assert_eq!(found.url, "https://example.com/device");
        assert_eq!(found.user_code, None);
    }

    #[test]
    fn trailing_punctuation_is_not_part_of_the_url() {
        let found = parse_verification("visit (https://example.com/device).").unwrap();
        assert_eq!(found.url, "https://example.com/device");
    }

    #[test]
    fn output_without_a_url_yields_nothing_yet() {
        assert_eq!(parse_verification(""), None);
        assert_eq!(parse_verification("Attempting to open the browser\n"), None);
    }

    // Words of four letters next to a hyphen must not be read as a code, or
    // the modal shows a fragment of a sentence where the code belongs.
    #[test]
    fn prose_is_not_mistaken_for_a_code() {
        assert!(find_user_code("open the following url - please wait").is_none());
        assert!(!is_user_code("abcd-efgh"));
        assert!(!is_user_code("ABCDE-FGH"));
        assert!(is_user_code("A1B2-C3D4"));
    }

    #[test]
    fn error_tail_keeps_the_last_nonempty_lines() {
        let output = "one\n\ntwo\nthree\n\n";
        assert_eq!(error_tail(output, 2), "two\nthree");
        assert_eq!(error_tail(output, 10), "one\ntwo\nthree");
        assert_eq!(error_tail("", 3), "");
    }
}
