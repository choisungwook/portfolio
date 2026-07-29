use std::path::Path;
use std::process::Command;

/// Result of one terraform invocation: success flag plus interleaved
/// stdout/stderr text.
pub struct TerraformOutput {
  pub success: bool,
  pub output: String,
}

/// File name of the saved plan inside a project directory. Applying this
/// exact file guarantees what was reviewed is what gets applied.
pub const PLAN_FILE: &str = ".akbun.tfplan";

pub fn init(bin: &str, project_dir: &Path) -> TerraformOutput {
  run(bin, project_dir, &["init", "-input=false", "-no-color"])
}

pub fn plan(bin: &str, project_dir: &Path) -> TerraformOutput {
  run(bin, project_dir, &["plan", "-input=false", "-no-color", &format!("-out={PLAN_FILE}")])
}

pub fn apply_saved_plan(bin: &str, project_dir: &Path) -> TerraformOutput {
  run(bin, project_dir, &["apply", "-input=false", "-no-color", PLAN_FILE])
}

pub fn import(bin: &str, project_dir: &Path, address: &str, id: &str) -> TerraformOutput {
  run(bin, project_dir, &["import", "-input=false", "-no-color", address, id])
}

fn run(bin: &str, project_dir: &Path, args: &[&str]) -> TerraformOutput {
  match Command::new(bin).args(args).current_dir(project_dir).output() {
    Ok(result) => {
      let mut output = String::from_utf8_lossy(&result.stdout).to_string();
      let stderr = String::from_utf8_lossy(&result.stderr);
      if !stderr.trim().is_empty() {
        output.push('\n');
        output.push_str(&stderr);
      }
      TerraformOutput { success: result.status.success(), output }
    }
    Err(e) => TerraformOutput {
      success: false,
      output: format!("failed to execute {bin} {}: {e}", args.join(" ")),
    },
  }
}
