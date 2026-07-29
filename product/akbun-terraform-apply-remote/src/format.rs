/// GitHub caps issue comments at 65536 characters. Keep headroom for the
/// markdown scaffolding around the terraform output.
const MAX_OUTPUT_CHARS: usize = 60_000;

/// One project's plan or apply result, ready to be rendered into a comment.
pub struct RunResult {
  pub dir: String,
  pub success: bool,
  pub output: String,
}

/// Renders the results of a plan or apply run over one or more projects
/// into a single pull request comment body.
pub fn render_comment(command_name: &str, results: &[RunResult]) -> String {
  let mut sections = Vec::new();
  for result in results {
    let status = if result.success { "success" } else { "failed" };
    let summary = summarize(&result.output).unwrap_or_else(|| status.to_string());
    sections.push(format!(
      "### terraform {command_name}: {dir} ({status})\n\n\
       {summary}\n\n\
       <details><summary>Show output</summary>\n\n\
       ```\n{output}\n```\n\n\
       </details>",
      dir = result.dir,
      output = truncate_middle(result.output.trim(), MAX_OUTPUT_CHARS),
    ));
  }
  sections.join("\n\n---\n\n")
}

/// Pulls the one-line result out of terraform output: the "Plan: ..." /
/// "Apply complete! ..." / "No changes." line, or the first error line.
pub fn summarize(output: &str) -> Option<String> {
  for line in output.lines() {
    let line = line.trim();
    if line.starts_with("Plan:")
      || line.starts_with("Apply complete!")
      || line.starts_with("No changes.")
      || line.starts_with("Error:")
    {
      return Some(line.to_string());
    }
  }
  None
}

/// Truncates long output from the middle, keeping the head (resource diff
/// starts) and the tail (summary and errors), which are the useful parts.
pub fn truncate_middle(text: &str, max_chars: usize) -> String {
  if text.chars().count() <= max_chars {
    return text.to_string();
  }
  let keep = max_chars / 2;
  let head: String = text.chars().take(keep).collect();
  let tail_start = text.chars().count() - keep;
  let tail: String = text.chars().skip(tail_start).collect();
  format!("{head}\n\n... output truncated by akbun-terraform-apply-remote ...\n\n{tail}")
}

#[cfg(test)]
mod tests {
  use super::*;

  const PLAN_OUTPUT: &str = "\
Terraform will perform the following actions:

  # aws_instance.web will be created
  + resource \"aws_instance\" \"web\" {}

Plan: 1 to add, 0 to change, 0 to destroy.";

  #[test]
  fn summarize_finds_plan_line() {
    assert_eq!(summarize(PLAN_OUTPUT), Some("Plan: 1 to add, 0 to change, 0 to destroy.".into()));
  }

  #[test]
  fn summarize_finds_apply_line() {
    let output = "aws_instance.web: Creating...\nApply complete! Resources: 1 added, 0 changed, 0 destroyed.";
    assert_eq!(
      summarize(output),
      Some("Apply complete! Resources: 1 added, 0 changed, 0 destroyed.".into())
    );
  }

  #[test]
  fn summarize_finds_no_changes_and_error() {
    assert_eq!(
      summarize("No changes. Your infrastructure matches the configuration."),
      Some("No changes. Your infrastructure matches the configuration.".into())
    );
    assert_eq!(
      summarize("something\nError: Invalid provider configuration"),
      Some("Error: Invalid provider configuration".into())
    );
  }

  #[test]
  fn summarize_returns_none_without_known_lines() {
    assert_eq!(summarize("Initializing the backend..."), None);
  }

  #[test]
  fn render_includes_dir_status_summary_and_output() {
    let comment = render_comment(
      "plan",
      &[RunResult { dir: "aws/vpc".into(), success: true, output: PLAN_OUTPUT.into() }],
    );
    assert!(comment.contains("### terraform plan: aws/vpc (success)"));
    assert!(comment.contains("Plan: 1 to add, 0 to change, 0 to destroy."));
    assert!(comment.contains("<details>"));
    assert!(comment.contains("aws_instance"));
  }

  #[test]
  fn render_marks_failures() {
    let comment = render_comment(
      "plan",
      &[RunResult { dir: ".".into(), success: false, output: "Error: boom".into() }],
    );
    assert!(comment.contains("### terraform plan: . (failed)"));
    assert!(comment.contains("Error: boom"));
  }

  #[test]
  fn render_joins_multiple_projects() {
    let comment = render_comment(
      "plan",
      &[
        RunResult { dir: "aws/vpc".into(), success: true, output: PLAN_OUTPUT.into() },
        RunResult { dir: "aws/rds".into(), success: true, output: PLAN_OUTPUT.into() },
      ],
    );
    assert!(comment.contains("aws/vpc"));
    assert!(comment.contains("aws/rds"));
    assert!(comment.contains("\n\n---\n\n"));
  }

  #[test]
  fn truncation_keeps_head_and_tail() {
    let long = format!("HEAD_MARKER\n{}\nTAIL_MARKER", "x".repeat(100_000));
    let truncated = truncate_middle(&long, 1000);
    assert!(truncated.contains("HEAD_MARKER"));
    assert!(truncated.contains("TAIL_MARKER"));
    assert!(truncated.contains("output truncated"));
    assert!(truncated.chars().count() < 1200);
  }

  #[test]
  fn short_output_is_untouched() {
    assert_eq!(truncate_middle("short", 1000), "short");
  }

  #[test]
  fn rendered_comment_stays_under_github_limit() {
    let huge = "x".repeat(200_000);
    let comment = render_comment(
      "plan",
      &[RunResult { dir: "aws/vpc".into(), success: true, output: huge }],
    );
    assert!(comment.chars().count() < 65_536);
  }
}
