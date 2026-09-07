use crate::api::Api;
use anyhow::{Context, Result, ensure};
use fs2::FileExt;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
  fs::{self, OpenOptions},
  io::Write,
  path::Path,
};

const NOTES: &str = "\n<!-- akbun-reader:notes -->\n";
const START: &str = "<!-- akbun-reader:managed -->\n";

#[derive(Serialize, Deserialize, Default)]
struct Cursor {
  server: String,
  after: u64,
}

pub fn write_atomic(path: &Path, content: &str) -> Result<()> {
  ensure!(
    !fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()),
    "심볼릭 링크에는 쓰지 않습니다."
  );
  let mut file = tempfile::NamedTempFile::new_in(path.parent().context("부모 경로 없음")?)?;
  file.write_all(content.as_bytes())?;
  file.as_file().sync_all()?;
  file.persist(path).map_err(|e| e.error)?;
  Ok(())
}

fn render(document: &Value, notes: &str) -> Result<String> {
  let metadata = json!({ "id": document["document_id"], "title": document["title"], "url": document["normalized_url"], "tags": document["tags"], "saved_at": document["created_at"], "location": document["location"], "deleted": document["id"].is_null() });
  let mut header = String::new();
  for (key, value) in metadata.as_object().unwrap() {
    header.push_str(&format!("{key}: {}\n", serde_json::to_string(value)?));
  }
  let body = document["body"]
    .as_str()
    .unwrap_or("서버에서 삭제된 문서입니다.");
  ensure!(
    !body.contains(NOTES) && !body.contains(START),
    "본문에 관리 구분자가 있어 덮어쓸 수 없습니다."
  );
  Ok(format!("---\n{header}---\n{START}\n{body}\n{NOTES}{notes}"))
}

pub fn apply(vault: &Path, document: &Value) -> Result<()> {
  let id = document["document_id"].as_str().context("문서 번호 누락")?;
  uuid::Uuid::parse_str(id).context("잘못된 문서 번호")?;
  let path = vault.join(format!("{id}.md"));
  ensure!(
    !fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()),
    "심볼릭 링크 문서는 건너뛸 수 없습니다."
  );
  let notes = match fs::read_to_string(&path) {
    Ok(old) => {
      ensure!(
        old.starts_with("---\n")
          && old.matches(START).count() == 1
          && old.matches(NOTES).count() == 1,
        "관리 구분자가 없는 기존 파일은 덮어쓰지 않습니다: {id}"
      );
      old.split_once(NOTES).unwrap().1.to_string()
    }
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
    Err(e) => return Err(e.into()),
  };
  write_atomic(&path, &render(document, &notes)?)
}

pub fn run(api: &Api, vault: &Path) -> Result<Value> {
  fs::create_dir_all(vault)?;
  let vault = vault.canonicalize()?;
  let lock_path = vault.join(".reader.lock");
  ensure!(
    !fs::symlink_metadata(&lock_path).is_ok_and(|m| m.file_type().is_symlink()),
    "잠금 파일 심볼릭 링크 불가"
  );
  let lock = OpenOptions::new()
    .create(true)
    .truncate(false)
    .write(true)
    .open(lock_path)?;
  lock
    .try_lock_exclusive()
    .context("다른 export가 실행 중입니다.")?;
  let state_path = vault.join(".reader-state.json");
  let mut cursor: Cursor = match fs::read_to_string(&state_path) {
    Ok(value) => serde_json::from_str(&value).context("동기화 상태가 손상되었습니다.")?,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Cursor {
      server: api.base.to_string(),
      after: 0,
    },
    Err(e) => return Err(e.into()),
  };
  ensure!(
    cursor.server == api.base.as_str(),
    "다른 서버의 vault입니다. 별도 폴더를 사용하세요."
  );
  let mut count = 0;
  loop {
    let page = api.call(
      Method::GET,
      &format!("changes?after={}", cursor.after),
      None,
    )?;
    let changes = page["changes"].as_array().context("변경 목록 누락")?;
    let next = page["next"].as_u64().context("다음 변경 번호 누락")?;
    ensure!(
      next >= cursor.after && (changes.is_empty() || next > cursor.after),
      "변경 번호가 진행하지 않습니다."
    );
    for change in changes {
      apply(&vault, change)?;
      count += 1;
    }
    cursor.after = next;
    write_atomic(&state_path, &serde_json::to_string(&cursor)?)?;
    if page["has_more"] != true {
      break;
    }
    ensure!(!changes.is_empty(), "빈 변경 페이지가 반복됩니다.");
  }
  Ok(json!({ "applied": count, "after": cursor.after }))
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn preserves_notes_and_rejects_unmanaged_files() {
    let dir = tempfile::tempdir().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let mut doc = json!({ "id":id, "document_id":id, "title":"a", "body":"old", "tags":[] });
    apply(dir.path(), &doc).unwrap();
    let path = dir.path().join(format!("{id}.md"));
    let text = fs::read_to_string(&path).unwrap() + "내 메모\n";
    fs::write(&path, text).unwrap();
    doc["body"] = json!("new");
    apply(dir.path(), &doc).unwrap();
    assert!(fs::read_to_string(&path).unwrap().ends_with("내 메모\n"));
    doc["id"] = Value::Null;
    apply(dir.path(), &doc).unwrap();
    assert!(fs::read_to_string(&path).unwrap().contains("deleted: true"));
    fs::write(&path, "사용자 파일").unwrap();
    assert!(apply(dir.path(), &doc).is_err());
  }
  #[test]
  fn rejects_path_traversal_and_marker_injection() {
    let dir = tempfile::tempdir().unwrap();
    assert!(apply(dir.path(), &json!({"document_id":"../secret"})).is_err());
    assert!(
      apply(
        dir.path(),
        &json!({"document_id":uuid::Uuid::new_v4().to_string(), "body":NOTES})
      )
      .is_err()
    );
  }
}

#[cfg(test)]
mod sync_tests {
  use super::*;
  #[test]
  fn failed_page_does_not_advance_cursor_and_retry_preserves_notes() {
    let directory = tempfile::tempdir().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let second = uuid::Uuid::new_v4().to_string();
    let unmanaged = directory.path().join(format!("{second}.md"));
    fs::write(&unmanaged, "user file").unwrap();
    let page = json!({"changes":[{"document_id":id,"id":id,"body":"first"},{"document_id":second,"id":second,"body":"second"}],"next":2,"has_more":false});
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let base = crate::api::base_url(&format!("http://{}", server.server_addr())).unwrap();
    let thread = std::thread::spawn(move || {
      for _ in 0..2 {
        let request = server.recv().unwrap();
        assert_eq!(request.url(), "/automation/changes?after=0");
        request
          .respond(tiny_http::Response::from_string(page.to_string()))
          .unwrap();
      }
    });
    let api = Api::new(base, "a".repeat(64)).unwrap();
    assert!(run(&api, directory.path()).is_err());
    assert!(!directory.path().join(".reader-state.json").exists());
    let first = directory.path().join(format!("{id}.md"));
    fs::write(&first, fs::read_to_string(&first).unwrap() + "notes").unwrap();
    fs::remove_file(unmanaged).unwrap();
    assert_eq!(run(&api, directory.path()).unwrap()["after"], 2);
    assert!(fs::read_to_string(first).unwrap().ends_with("notes"));
    thread.join().unwrap();
  }
}
