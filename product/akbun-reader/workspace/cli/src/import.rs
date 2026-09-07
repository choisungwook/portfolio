use crate::api::Api;
use anyhow::{Context, Result, ensure};
use reqwest::Method;
use serde_json::{Value, json};
use std::{
  collections::BTreeMap,
  fs,
  path::{Path, PathBuf},
  thread,
  time::Duration,
};
use unicode_normalization::UnicodeNormalization;

pub fn clean_tag(value: &str) -> String {
  let clean: String = value
    .chars()
    .filter(|c| !c.is_control() && !matches!(*c, '\u{feff}' | '\u{200b}'))
    .collect();
  let clean: String = clean.trim().nfc().collect();
  if clean == "재태크" {
    "재테크".into()
  } else {
    clean
  }
}

pub fn run(api: &Api, csv_path: &Path, body_dir: &Path, mapping: Option<&Path>) -> Result<Value> {
  let columns: BTreeMap<String, String> = match mapping {
    Some(path) => serde_json::from_str(&fs::read_to_string(path)?)?,
    None => BTreeMap::new(),
  };
  let root = body_dir.canonicalize()?;
  let mut reader = csv::Reader::from_path(csv_path)?;
  let headers = reader.headers()?.clone();
  let column = |name: &str| -> Option<usize> {
    headers.iter().position(|h| {
      h.trim_start_matches('\u{feff}') == columns.get(name).map(String::as_str).unwrap_or(name)
    })
  };
  for name in [
    "url",
    "title",
    "tags",
    "location",
    "saved_at",
    "body_file",
    "category",
  ] {
    ensure!(
      column(name).is_some(),
      "CSV 열 {name} 누락. --mapping JSON으로 원본 헤더를 지정하세요."
    );
  }
  let mut counts = BTreeMap::<String, u64>::new();
  let mut tag_counts = BTreeMap::<String, u64>::new();
  let mut seen = std::collections::BTreeSet::new();
  for (index, row) in reader.records().enumerate() {
    let row = row.with_context(|| format!("CSV {}행 오류", index + 2))?;
    let value = |name: &str| row.get(column(name).unwrap()).unwrap_or("");
    if ["rss", "feed", "highlight"].contains(&value("category").trim().to_lowercase().as_str())
      || value("location") == "feed"
    {
      *counts.entry("excluded".into()).or_default() += 1;
      continue;
    }
    let tags: Vec<String> = if value("tags").trim().is_empty() {
      vec![]
    } else {
      serde_json::from_str(value("tags"))
        .with_context(|| format!("{}행 tags는 JSON 문자열 배열이어야 합니다.", index + 2))?
    };
    let tags: std::collections::BTreeSet<_> = tags
      .iter()
      .map(|s| clean_tag(s))
      .filter(|s| !s.is_empty())
      .collect();
    let location = match value("location") {
      "new" | "inbox" => "inbox",
      "later" | "shortlist" => "later",
      "archive" => "archive",
      other => anyhow::bail!("알 수 없는 위치: {other}"),
    };
    let (body, format) = body_file(&root, value("body_file"))?;
    let document = json!({"url":value("url"), "title":value("title"), "tags":tags, "location":location, "saved_at":value("saved_at"), "body":body, "format":format});
    ensure!(
      serde_json::to_vec(&document)?.len() <= 128000,
      "{}행이 API 128KB 상한을 초과합니다.",
      index + 2
    );
    let result = api
      .call(Method::POST, "import", Some(&document))
      .with_context(|| format!("{}행에서 중단; 재실행 시 기존 URL은 유지됩니다.", index + 2))?;
    let status = result["status"].as_str().context("import 결과 누락")?;
    *counts.entry(status.into()).or_default() += 1;
    let actual_tags: Vec<String> = serde_json::from_value(result["document"]["tags"].clone())?;
    if seen.insert(
      result["document"]["id"]
        .as_str()
        .context("문서 번호 누락")?
        .to_string(),
    ) {
      for tag in actual_tags {
        *tag_counts.entry(tag).or_default() += 1;
      }
    }
    thread::sleep(Duration::from_millis(100));
  }
  Ok(
    json!({"counts":counts, "unique_documents":seen.len(), "result_tags":tag_counts, "server_tags":api.call(Method::GET, "tags", None)?}),
  )
}

fn body_file(root: &Path, name: &str) -> Result<(String, &'static str)> {
  if name.is_empty() {
    return Ok((String::new(), "markdown"));
  }
  let relative = PathBuf::from(name);
  ensure!(!relative.is_absolute(), "본문 파일은 상대 경로여야 합니다.");
  let path = root.join(relative).canonicalize()?;
  ensure!(path.starts_with(root), "본문 경로가 지정 폴더 밖입니다.");
  ensure!(
    fs::metadata(&path)?.len() <= 100000,
    "본문 파일 100KB 상한 초과"
  );
  let format = match path.extension().and_then(|s| s.to_str()) {
    Some("html" | "htm") => "html",
    Some("md" | "txt") => "markdown",
    _ => anyhow::bail!("지원하지 않는 본문 파일 형식"),
  };
  Ok((fs::read_to_string(path)?, format))
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn cleans_tags_and_restricts_body_paths() {
    assert_eq!(clean_tag("\u{feff}\u{001f}재태크 "), "재테크");
    let dir = tempfile::tempdir().unwrap();
    assert!(body_file(dir.path(), "/etc/hosts").is_err());
    assert!(body_file(dir.path(), "../outside.md").is_err());
  }
}

#[cfg(test)]
mod import_tests {
  use super::*;
  #[test]
  fn imports_csv_body_and_reports_unique_tags_while_excluding_feeds() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("body.md"), "본문").unwrap();
    let path = dir.path().join("documents.csv");
    let mut writer = csv::Writer::from_path(&path).unwrap();
    writer
      .write_record([
        "url",
        "title",
        "tags",
        "location",
        "saved_at",
        "body_file",
        "category",
      ])
      .unwrap();
    for category in ["article", "article", "rss"] {
      writer
        .write_record([
          "https://example.com",
          "title",
          "[\"재태크\",\"재테크\"]",
          "archive",
          "2020-01-01T00:00:00Z",
          "body.md",
          category,
        ])
        .unwrap();
    }
    writer.flush().unwrap();
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let base = crate::api::base_url(&format!("http://{}", server.server_addr())).unwrap();
    let thread = std::thread::spawn(move || {
      for status in ["imported", "existing"] {
        let mut request = server.recv().unwrap();
        let mut body = String::new();
        request.as_reader().read_to_string(&mut body).unwrap();
        let value: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(value["body"], "본문");
        assert_eq!(value["tags"], json!(["재테크"]));
        assert_eq!(value["saved_at"], "2020-01-01T00:00:00Z");
        request
          .respond(tiny_http::Response::from_string(
            json!({"status":status,"document":{"id":"same","tags":["재테크"]}}).to_string(),
          ))
          .unwrap();
      }
      server
        .recv()
        .unwrap()
        .respond(tiny_http::Response::from_string("{\"tags\":[]}"))
        .unwrap();
    });
    let report = run(
      &Api::new(base, "a".repeat(64)).unwrap(),
      &path,
      dir.path(),
      None,
    )
    .unwrap();
    assert_eq!(report["counts"]["excluded"], 1);
    assert_eq!(report["result_tags"]["재테크"], 1);
    assert_eq!(report["unique_documents"], 1);
    thread.join().unwrap();
  }
}
