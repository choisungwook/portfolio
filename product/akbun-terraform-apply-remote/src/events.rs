use serde_json::Value;

/// A webhook payload reduced to the cases this server acts on.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Event {
  /// A new comment on a pull request; the body may contain a command.
  Comment { repo: RepoRef, pr_number: u64, body: String, author: String },
  /// A pull request was opened or its head was updated; triggers autoplan.
  PrUpdated { repo: RepoRef, pr_number: u64 },
  /// A pull request was closed or merged; locks and workspace are cleaned up.
  PrClosed { repo: RepoRef, pr_number: u64 },
}

/// "owner/name" pair identifying a GitHub repository.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoRef {
  pub owner: String,
  pub name: String,
}

impl RepoRef {
  pub fn full_name(&self) -> String {
    format!("{}/{}", self.owner, self.name)
  }
}

/// Interprets a GitHub webhook (event name header + JSON payload) into an
/// Event. Returns Err with a human-readable reason for payloads this server
/// deliberately ignores, such as bot comments or unrelated event types.
pub fn interpret(event_name: &str, payload: &Value) -> Result<Event, String> {
  match event_name {
    "issue_comment" => interpret_comment(payload),
    "pull_request" => interpret_pull_request(payload),
    other => Err(format!("ignoring event type: {other}")),
  }
}

fn interpret_comment(payload: &Value) -> Result<Event, String> {
  if payload["action"].as_str() != Some("created") {
    return Err("ignoring non-created comment action".to_string());
  }
  if payload["issue"]["pull_request"].is_null() {
    return Err("comment is on an issue, not a pull request".to_string());
  }
  if payload["comment"]["user"]["type"].as_str() == Some("Bot") {
    return Err("ignoring bot comment".to_string());
  }
  Ok(Event::Comment {
    repo: repo_ref(payload)?,
    pr_number: payload["issue"]["number"].as_u64().ok_or("missing issue number")?,
    body: payload["comment"]["body"].as_str().unwrap_or_default().to_string(),
    author: payload["comment"]["user"]["login"].as_str().unwrap_or_default().to_string(),
  })
}

fn interpret_pull_request(payload: &Value) -> Result<Event, String> {
  let repo = repo_ref(payload)?;
  let pr_number = payload["pull_request"]["number"].as_u64().ok_or("missing PR number")?;
  match payload["action"].as_str() {
    Some("opened") | Some("synchronize") | Some("reopened") => {
      Ok(Event::PrUpdated { repo, pr_number })
    }
    Some("closed") => Ok(Event::PrClosed { repo, pr_number }),
    other => Err(format!("ignoring pull_request action: {other:?}")),
  }
}

fn repo_ref(payload: &Value) -> Result<RepoRef, String> {
  let full_name =
    payload["repository"]["full_name"].as_str().ok_or("missing repository.full_name")?;
  let (owner, name) = full_name.split_once('/').ok_or("malformed repository.full_name")?;
  Ok(RepoRef { owner: owner.to_string(), name: name.to_string() })
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  fn comment_payload(action: &str, on_pr: bool, user_type: &str) -> Value {
    let mut issue = json!({"number": 7});
    if on_pr {
      issue["pull_request"] = json!({"url": "https://api.github.com/repos/o/r/pulls/7"});
    }
    json!({
      "action": action,
      "issue": issue,
      "comment": {"body": "akbun plan", "user": {"login": "alice", "type": user_type}},
      "repository": {"full_name": "octo/infra"}
    })
  }

  #[test]
  fn interprets_pr_comment() {
    let event = interpret("issue_comment", &comment_payload("created", true, "User")).unwrap();
    assert_eq!(
      event,
      Event::Comment {
        repo: RepoRef { owner: "octo".to_string(), name: "infra".to_string() },
        pr_number: 7,
        body: "akbun plan".to_string(),
        author: "alice".to_string(),
      }
    );
  }

  #[test]
  fn ignores_comment_on_plain_issue() {
    assert!(interpret("issue_comment", &comment_payload("created", false, "User")).is_err());
  }

  #[test]
  fn ignores_edited_comment() {
    assert!(interpret("issue_comment", &comment_payload("edited", true, "User")).is_err());
  }

  #[test]
  fn ignores_bot_comment_to_avoid_feedback_loop() {
    assert!(interpret("issue_comment", &comment_payload("created", true, "Bot")).is_err());
  }

  fn pr_payload(action: &str) -> Value {
    json!({
      "action": action,
      "pull_request": {"number": 12},
      "repository": {"full_name": "octo/infra"}
    })
  }

  #[test]
  fn pr_open_and_synchronize_trigger_autoplan() {
    for action in ["opened", "synchronize", "reopened"] {
      let event = interpret("pull_request", &pr_payload(action)).unwrap();
      assert!(matches!(event, Event::PrUpdated { pr_number: 12, .. }), "action: {action}");
    }
  }

  #[test]
  fn pr_close_triggers_cleanup() {
    let event = interpret("pull_request", &pr_payload("closed")).unwrap();
    assert!(matches!(event, Event::PrClosed { pr_number: 12, .. }));
  }

  #[test]
  fn ignores_unrelated_event_types() {
    assert!(interpret("push", &json!({})).is_err());
    assert!(interpret("pull_request", &pr_payload("labeled")).is_err());
  }
}
