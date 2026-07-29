/// A command extracted from a pull request comment.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Command {
  /// Run terraform plan. `dir` narrows the run to one project directory.
  Plan { dir: Option<String> },
  /// Apply the saved plan. `dir` narrows the run to one project directory.
  Apply { dir: Option<String> },
  /// Import an existing resource into terraform state.
  Import { dir: Option<String>, address: String, id: String },
  /// Release every lock this pull request holds.
  Unlock,
  /// Post usage help.
  Help,
}

/// Why a comment did not produce a runnable command.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ParseError {
  /// No line in the comment started with the trigger word.
  NotACommand,
  /// The trigger word was present but the rest was not understood.
  Unrecognized(String),
}

/// Parses a pull request comment body into a command.
///
/// A command is a line whose first word is the trigger word, e.g.
/// "akbun plan -d aws/vpc". Only the first trigger line is honored.
pub fn parse(trigger: &str, comment_body: &str) -> Result<Command, ParseError> {
  for line in comment_body.lines() {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    match tokens.first() {
      Some(first) if first.eq_ignore_ascii_case(trigger) => return parse_tokens(&tokens[1..]),
      _ => continue,
    }
  }
  Err(ParseError::NotACommand)
}

fn parse_tokens(tokens: &[&str]) -> Result<Command, ParseError> {
  match tokens.first() {
    Some(&"plan") => Ok(Command::Plan { dir: parse_dir_flag(&tokens[1..])? }),
    Some(&"apply") => Ok(Command::Apply { dir: parse_dir_flag(&tokens[1..])? }),
    Some(&"import") => parse_import(&tokens[1..]),
    Some(&"unlock") => Ok(Command::Unlock),
    Some(&"help") | None => Ok(Command::Help),
    Some(other) => Err(ParseError::Unrecognized(format!("unknown subcommand: {other}"))),
  }
}

/// Parses "import [-d <dir>] <address> <id>". The -d flag may appear
/// before or after the two positional arguments.
fn parse_import(tokens: &[&str]) -> Result<Command, ParseError> {
  let mut dir = None;
  let mut positional = Vec::new();
  let mut iter = tokens.iter();
  while let Some(token) = iter.next() {
    if *token == "-d" || *token == "--dir" {
      match iter.next() {
        Some(value) => dir = Some(normalize_dir(value)),
        None => return Err(ParseError::Unrecognized("-d needs a directory".to_string())),
      }
    } else {
      positional.push(*token);
    }
  }
  match positional.as_slice() {
    [address, id] => {
      Ok(Command::Import { dir, address: address.to_string(), id: id.to_string() })
    }
    _ => Err(ParseError::Unrecognized(
      "import needs exactly two arguments: <resource address> <resource id>".to_string(),
    )),
  }
}

fn parse_dir_flag(tokens: &[&str]) -> Result<Option<String>, ParseError> {
  match tokens {
    [] => Ok(None),
    ["-d", dir] | ["--dir", dir] => Ok(Some(normalize_dir(dir))),
    ["-d"] | ["--dir"] => Err(ParseError::Unrecognized("-d needs a directory".to_string())),
    other => Err(ParseError::Unrecognized(format!("unexpected arguments: {}", other.join(" ")))),
  }
}

/// Normalizes a user-supplied project directory: strips "./" and trailing "/".
fn normalize_dir(dir: &str) -> String {
  let dir = dir.strip_prefix("./").unwrap_or(dir);
  let dir = dir.trim_end_matches('/');
  if dir.is_empty() { ".".to_string() } else { dir.to_string() }
}

/// Usage text posted in reply to "help" or an unrecognized command.
pub fn usage(trigger: &str) -> String {
  format!(
    "Usage:\n\
     - {trigger} plan [-d <dir>]: run terraform plan for changed projects (or one directory)\n\
     - {trigger} apply [-d <dir>]: apply the plan saved by the latest plan run\n\
     - {trigger} import [-d <dir>] <address> <id>: import an existing resource into state\n\
     - {trigger} unlock: release locks held by this pull request\n\
     - {trigger} help: show this message"
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_plain_plan() {
    assert_eq!(parse("akbun", "akbun plan"), Ok(Command::Plan { dir: None }));
  }

  #[test]
  fn parses_apply_with_dir_flag() {
    assert_eq!(
      parse("akbun", "akbun apply -d aws/vpc"),
      Ok(Command::Apply { dir: Some("aws/vpc".to_string()) })
    );
  }

  #[test]
  fn parses_long_dir_flag_and_normalizes() {
    assert_eq!(
      parse("akbun", "akbun plan --dir ./aws/vpc/"),
      Ok(Command::Plan { dir: Some("aws/vpc".to_string()) })
    );
  }

  #[test]
  fn trigger_is_case_insensitive() {
    assert_eq!(parse("akbun", "AKBUN plan"), Ok(Command::Plan { dir: None }));
  }

  #[test]
  fn finds_command_on_later_line() {
    let body = "LGTM overall.\n\nakbun apply";
    assert_eq!(parse("akbun", body), Ok(Command::Apply { dir: None }));
  }

  #[test]
  fn ignores_trigger_mentioned_mid_sentence() {
    assert_eq!(parse("akbun", "please run akbun plan later"), Err(ParseError::NotACommand));
  }

  #[test]
  fn plain_comment_is_not_a_command() {
    assert_eq!(parse("akbun", "looks good to me"), Err(ParseError::NotACommand));
  }

  #[test]
  fn bare_trigger_shows_help() {
    assert_eq!(parse("akbun", "akbun"), Ok(Command::Help));
  }

  #[test]
  fn parses_unlock() {
    assert_eq!(parse("akbun", "akbun unlock"), Ok(Command::Unlock));
  }

  #[test]
  fn unknown_subcommand_is_reported() {
    assert!(matches!(parse("akbun", "akbun destroy"), Err(ParseError::Unrecognized(_))));
  }

  #[test]
  fn dir_flag_without_value_is_reported() {
    assert!(matches!(parse("akbun", "akbun plan -d"), Err(ParseError::Unrecognized(_))));
  }

  #[test]
  fn parses_import_with_address_and_id() {
    assert_eq!(
      parse("akbun", "akbun import aws_instance.web i-1234567890abcdef0"),
      Ok(Command::Import {
        dir: None,
        address: "aws_instance.web".to_string(),
        id: "i-1234567890abcdef0".to_string(),
      })
    );
  }

  #[test]
  fn parses_import_with_dir_flag_in_any_position() {
    let expected = Ok(Command::Import {
      dir: Some("aws/vpc".to_string()),
      address: "aws_vpc.main".to_string(),
      id: "vpc-123".to_string(),
    });
    assert_eq!(parse("akbun", "akbun import -d aws/vpc aws_vpc.main vpc-123"), expected);
    assert_eq!(parse("akbun", "akbun import aws_vpc.main vpc-123 -d aws/vpc"), expected);
  }

  #[test]
  fn import_with_wrong_arity_is_reported() {
    assert!(matches!(parse("akbun", "akbun import aws_vpc.main"), Err(ParseError::Unrecognized(_))));
    assert!(matches!(parse("akbun", "akbun import a b c"), Err(ParseError::Unrecognized(_))));
  }

  #[test]
  fn custom_trigger_word_is_honored() {
    assert_eq!(parse("terraform-bot", "terraform-bot plan"), Ok(Command::Plan { dir: None }));
    assert_eq!(parse("terraform-bot", "akbun plan"), Err(ParseError::NotACommand));
  }
}
