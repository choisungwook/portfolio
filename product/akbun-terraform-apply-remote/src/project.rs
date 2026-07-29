use std::collections::BTreeSet;

/// File extensions that mark a directory as a terraform project.
const TERRAFORM_EXTENSIONS: [&str; 4] = [".tf", ".tfvars", ".tf.json", ".tfvars.json"];

/// Derives the terraform project directories affected by a pull request
/// from its changed file paths.
///
/// A project is the directory that directly contains a changed terraform
/// file. Files under a ".terraform" cache directory are ignored. The result
/// is deduplicated and sorted; the repository root becomes ".".
pub fn projects_from_changed_files(changed_files: &[String]) -> Vec<String> {
  let mut dirs = BTreeSet::new();
  for path in changed_files {
    if !is_terraform_file(path) || in_terraform_cache(path) {
      continue;
    }
    dirs.insert(parent_dir(path));
  }
  dirs.into_iter().collect()
}

fn is_terraform_file(path: &str) -> bool {
  TERRAFORM_EXTENSIONS.iter().any(|ext| path.ends_with(ext))
}

fn in_terraform_cache(path: &str) -> bool {
  path.split('/').any(|segment| segment == ".terraform")
}

fn parent_dir(path: &str) -> String {
  match path.rsplit_once('/') {
    Some((dir, _file)) => dir.to_string(),
    None => ".".to_string(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn strings(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
  }

  #[test]
  fn maps_changed_files_to_their_directories() {
    let files = strings(&["aws/vpc/vpc.tf", "aws/vpc/variables.tf", "aws/rds/rds.tf"]);
    assert_eq!(projects_from_changed_files(&files), vec!["aws/rds", "aws/vpc"]);
  }

  #[test]
  fn ignores_non_terraform_files() {
    let files = strings(&["aws/vpc/README.md", "docs/guide.md", "src/main.rs"]);
    assert!(projects_from_changed_files(&files).is_empty());
  }

  #[test]
  fn includes_tfvars_and_json_variants() {
    let files = strings(&["envs/prod/prod.tfvars", "envs/dev/config.tf.json"]);
    assert_eq!(projects_from_changed_files(&files), vec!["envs/dev", "envs/prod"]);
  }

  #[test]
  fn repository_root_becomes_dot() {
    let files = strings(&["main.tf"]);
    assert_eq!(projects_from_changed_files(&files), vec!["."]);
  }

  #[test]
  fn skips_terraform_cache_directories() {
    let files = strings(&["aws/vpc/.terraform/modules/vpc/main.tf"]);
    assert!(projects_from_changed_files(&files).is_empty());
  }

  #[test]
  fn deduplicates_projects() {
    let files = strings(&["aws/vpc/a.tf", "aws/vpc/b.tf", "aws/vpc/c.tfvars"]);
    assert_eq!(projects_from_changed_files(&files), vec!["aws/vpc"]);
  }
}
