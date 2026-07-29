use crate::auth::TokenProvider;
use crate::events::RepoRef;
use serde_json::Value;
use std::sync::Arc;

/// Minimal GitHub REST API client for the endpoints this server needs.
/// Tokens come from the provider per call, so short-lived App tokens are
/// refreshed transparently.
pub struct GithubClient {
  api_base: String,
  provider: Arc<TokenProvider>,
}

pub struct PrInfo {
  pub head_sha: String,
}

impl GithubClient {
  pub fn new(api_base: &str, provider: Arc<TokenProvider>) -> GithubClient {
    GithubClient { api_base: api_base.trim_end_matches('/').to_string(), provider }
  }

  pub fn get_pr(&self, repo: &RepoRef, pr_number: u64) -> Result<PrInfo, String> {
    let url = format!("{}/repos/{}/pulls/{}", self.api_base, repo.full_name(), pr_number);
    let body: Value = self.get(&url)?;
    let head_sha = body["head"]["sha"].as_str().ok_or("PR response missing head.sha")?;
    Ok(PrInfo { head_sha: head_sha.to_string() })
  }

  /// Lists every changed file path in the pull request, following
  /// pagination until the API returns a partial or empty page.
  pub fn list_changed_files(&self, repo: &RepoRef, pr_number: u64) -> Result<Vec<String>, String> {
    const PER_PAGE: usize = 100;
    let mut files = Vec::new();
    let mut page = 1;
    loop {
      let url = format!(
        "{}/repos/{}/pulls/{}/files?per_page={}&page={}",
        self.api_base,
        repo.full_name(),
        pr_number,
        PER_PAGE,
        page
      );
      let body: Value = self.get(&url)?;
      let items = body.as_array().ok_or("files response is not an array")?;
      for item in items {
        if let Some(filename) = item["filename"].as_str() {
          files.push(filename.to_string());
        }
      }
      if items.len() < PER_PAGE {
        return Ok(files);
      }
      page += 1;
    }
  }

  pub fn post_comment(&self, repo: &RepoRef, pr_number: u64, body: &str) -> Result<(), String> {
    let url =
      format!("{}/repos/{}/issues/{}/comments", self.api_base, repo.full_name(), pr_number);
    ureq::post(&url)
      .set("Authorization", &format!("Bearer {}", self.provider.token()?))
      .set("Accept", "application/vnd.github+json")
      .set("User-Agent", "akbun-terraform-apply-remote")
      .send_json(serde_json::json!({ "body": body }))
      .map_err(|e| format!("POST {url} failed: {e}"))?;
    Ok(())
  }

  fn get(&self, url: &str) -> Result<Value, String> {
    ureq::get(url)
      .set("Authorization", &format!("Bearer {}", self.provider.token()?))
      .set("Accept", "application/vnd.github+json")
      .set("User-Agent", "akbun-terraform-apply-remote")
      .call()
      .map_err(|e| format!("GET {url} failed: {e}"))?
      .into_json::<Value>()
      .map_err(|e| format!("GET {url} returned invalid JSON: {e}"))
  }
}
