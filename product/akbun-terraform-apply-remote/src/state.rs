use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Locks and planned head SHAs, persisted so a restarted or redeployed
/// server instance takes over exactly where the previous one stopped.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedState {
  pub locks: HashMap<String, u64>,
  pub planned_shas: HashMap<String, String>,
}

pub fn state_file(data_dir: &str) -> PathBuf {
  Path::new(data_dir).join("state.json")
}

/// Writes the state atomically: to a temp file first, then rename, so a
/// crash mid-write never leaves a truncated state file behind.
pub fn save(path: &Path, state: &PersistedState) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("mkdir {parent:?} failed: {e}"))?;
  }
  let json = serde_json::to_string_pretty(state).map_err(|e| format!("serialize failed: {e}"))?;
  let tmp = path.with_extension("json.tmp");
  std::fs::write(&tmp, json).map_err(|e| format!("write {tmp:?} failed: {e}"))?;
  std::fs::rename(&tmp, path).map_err(|e| format!("rename to {path:?} failed: {e}"))
}

/// Loads the state file. A missing file is a normal first boot; an
/// unreadable or corrupt file is reported and treated as empty rather
/// than blocking startup.
pub fn load(path: &Path) -> PersistedState {
  let raw = match std::fs::read_to_string(path) {
    Ok(raw) => raw,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => return PersistedState::default(),
    Err(e) => {
      eprintln!("state file {path:?} unreadable ({e}); starting with empty state");
      return PersistedState::default();
    }
  };
  match serde_json::from_str(&raw) {
    Ok(state) => state,
    Err(e) => {
      eprintln!("state file {path:?} corrupt ({e}); starting with empty state");
      PersistedState::default()
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("atr-state-test-{name}-{}", std::process::id()))
  }

  fn sample_state() -> PersistedState {
    let mut state = PersistedState::default();
    state.locks.insert("o/r::aws/vpc".to_string(), 7);
    state.planned_shas.insert("o/r::7::aws/vpc".to_string(), "abc1234".to_string());
    state
  }

  #[test]
  fn save_and_load_round_trip() {
    let dir = temp_path("round-trip");
    let path = dir.join("state.json");
    let state = sample_state();
    save(&path, &state).unwrap();
    assert_eq!(load(&path), state);
    let _ = std::fs::remove_dir_all(dir);
  }

  #[test]
  fn missing_file_loads_empty_state() {
    let path = temp_path("missing").join("state.json");
    assert_eq!(load(&path), PersistedState::default());
  }

  #[test]
  fn corrupt_file_loads_empty_state() {
    let dir = temp_path("corrupt");
    let path = dir.join("state.json");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(&path, "{not json").unwrap();
    assert_eq!(load(&path), PersistedState::default());
    let _ = std::fs::remove_dir_all(dir);
  }

  #[test]
  fn save_overwrites_previous_state() {
    let dir = temp_path("overwrite");
    let path = dir.join("state.json");
    save(&path, &sample_state()).unwrap();
    let empty = PersistedState::default();
    save(&path, &empty).unwrap();
    assert_eq!(load(&path), empty);
    let _ = std::fs::remove_dir_all(dir);
  }
}
