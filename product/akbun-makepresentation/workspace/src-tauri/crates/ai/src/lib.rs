use serde::Serialize;
use serde_json::Value;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Component, Path, PathBuf};

pub const MAX_SESSIONS: usize = 3;
pub const SESSION_LIMIT_BYTES: u64 = 128 * 1024 * 1024;
pub const SESSION_RESERVE_BYTES: u64 = 4 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub status: String,
    pub size_bytes: u64,
    pub message_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachedImage {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug)]
pub struct AiStore {
    root: PathBuf,
}

impl AiStore {
    pub fn new(app_data_dir: impl Into<PathBuf>) -> Self {
        Self {
            root: app_data_dir.into().join("ai"),
        }
    }

    pub fn ensure(&self) -> Result<(), String> {
        fs::create_dir_all(self.sessions_root()).map_err(display_error("create AI sessions"))?;
        fs::create_dir_all(self.runtime_root()).map_err(display_error("create AI runtime"))
    }

    pub fn sessions_root(&self) -> PathBuf {
        self.root.join("sessions")
    }

    pub fn runtime_root(&self) -> PathBuf {
        self.root.join("runtime")
    }

    pub fn session_dir(&self, id: &str) -> Result<PathBuf, String> {
        validate_id(id)?;
        Ok(self.sessions_root().join(id))
    }

    pub fn list_sessions(&self) -> Result<Vec<SessionSummary>, String> {
        self.ensure()?;
        let mut sessions = Vec::new();
        for entry in
            fs::read_dir(self.sessions_root()).map_err(display_error("list AI sessions"))?
        {
            let entry = entry.map_err(display_error("read AI session entry"))?;
            if !entry
                .file_type()
                .map_err(display_error("inspect AI session entry"))?
                .is_dir()
            {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            if validate_id(&id).is_err() {
                continue;
            }
            let path = entry.path().join("session.json");
            let value = match read_json(&path) {
                Ok(value) => value,
                Err(_) => continue,
            };
            sessions.push(SessionSummary {
                id: id.clone(),
                title: text_field(&value, "title", "Untitled conversation"),
                created_at: text_field(&value, "createdAt", ""),
                updated_at: text_field(&value, "updatedAt", ""),
                status: text_field(&value, "status", "readonly"),
                size_bytes: directory_size(&entry.path())?,
                message_count: value
                    .get("messages")
                    .and_then(Value::as_array)
                    .map_or(0, Vec::len),
            });
        }
        sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        Ok(sessions)
    }

    pub fn load_session(&self, id: &str) -> Result<Value, String> {
        read_json(&self.session_dir(id)?.join("session.json"))
    }

    pub fn save_session(&self, id: &str, session: &Value) -> Result<u64, String> {
        self.ensure()?;
        let directory = self.session_dir(id)?;
        let path = directory.join("session.json");
        if !path.exists() && self.list_sessions()?.len() >= MAX_SESSIONS {
            return Err("session_count_limit: delete an existing conversation first".into());
        }
        let bytes = serde_json::to_vec_pretty(session)
            .map_err(|error| format!("cannot serialize AI session: {error}"))?;
        let current_size = if directory.exists() {
            directory_size(&directory)?
        } else {
            0
        };
        let old_size = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);
        let next_size = current_size.saturating_sub(old_size) + bytes.len() as u64 + 1;
        ensure_capacity(next_size)?;

        fs::create_dir_all(&directory).map_err(display_error("create AI session"))?;
        let temporary = directory.join("session.json.tmp");
        let file = File::create(&temporary).map_err(display_error("write AI session"))?;
        let mut writer = BufWriter::new(file);
        writer
            .write_all(&bytes)
            .map_err(display_error("write AI session"))?;
        writer
            .write_all(b"\n")
            .map_err(display_error("write AI session"))?;
        writer.flush().map_err(display_error("flush AI session"))?;
        fs::rename(&temporary, &path).map_err(display_error("replace AI session"))?;
        Ok(next_size)
    }

    pub fn delete_session(&self, id: &str) -> Result<(), String> {
        let directory = self.session_dir(id)?;
        if !directory.exists() {
            return Ok(());
        }
        fs::remove_dir_all(directory).map_err(display_error("delete AI session"))
    }

    pub fn attach_image(
        &self,
        session_id: &str,
        source_path: &Path,
        image_id: &str,
        allowed_source_roots: &[PathBuf],
    ) -> Result<AttachedImage, String> {
        validate_id(image_id)?;
        let session_dir = self.session_dir(session_id)?;
        if !session_dir.join("session.json").exists() {
            return Err(
                "session_not_found: save the conversation before attaching an image".into(),
            );
        }
        let source = source_path
            .canonicalize()
            .map_err(display_error("locate generated image"))?;
        let allowed = allowed_source_roots.iter().any(|root| {
            root.canonicalize()
                .map(|canonical| source.starts_with(canonical))
                .unwrap_or(false)
        });
        if !allowed || !source.is_file() {
            return Err("invalid_image_source: image is outside Codex generated images".into());
        }
        let extension = image_extension(&source)?;
        let size = source
            .metadata()
            .map_err(display_error("inspect generated image"))?
            .len();
        let next_size = directory_size(&session_dir)? + size;
        if let Err(error) = ensure_capacity(next_size) {
            let _ = fs::remove_file(&source);
            return Err(error);
        }

        let images = session_dir.join("images");
        fs::create_dir_all(&images).map_err(display_error("create AI image directory"))?;
        let file_name = format!("{image_id}.{extension}");
        let destination = images.join(&file_name);
        fs::copy(&source, &destination).map_err(display_error("store generated image"))?;
        if let Err(error) = fs::remove_file(&source) {
            let _ = fs::remove_file(&destination);
            return Err(format!("cannot remove temporary generated image: {error}"));
        }
        Ok(AttachedImage {
            id: image_id.to_string(),
            file_name,
            path: destination.to_string_lossy().to_string(),
            size_bytes: size,
        })
    }

    pub fn copy_image(&self, source_path: &Path, destination: &Path) -> Result<(), String> {
        let source = source_path
            .canonicalize()
            .map_err(display_error("locate AI image"))?;
        let sessions = self
            .sessions_root()
            .canonicalize()
            .map_err(display_error("locate AI sessions"))?;
        if !source.starts_with(sessions) || !source.is_file() {
            return Err("invalid_image_source: image is outside saved AI sessions".into());
        }
        fs::copy(source, destination).map_err(display_error("save AI image"))?;
        Ok(())
    }
}

fn ensure_capacity(size: u64) -> Result<(), String> {
    if size > SESSION_LIMIT_BYTES - SESSION_RESERVE_BYTES {
        Err("session_limit_exceeded: conversation would exceed 128 MiB".into())
    } else {
        Ok(())
    }
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 64
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(
            "invalid_session_id: expected 1-64 letters, digits, hyphens, or underscores".into(),
        );
    }
    Ok(())
}

fn image_extension(path: &Path) -> Result<&'static str, String> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
    {
        Some(value) if value == "png" => Ok("png"),
        Some(value) if value == "jpg" || value == "jpeg" => Ok("jpg"),
        Some(value) if value == "webp" => Ok("webp"),
        _ => Err("unsupported_image_format: expected PNG, JPEG, or WebP".into()),
    }
}

fn read_json(path: &Path) -> Result<Value, String> {
    let contents = fs::read_to_string(path).map_err(display_error("read AI session"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("cannot parse {}: {error}", path.display()))
}

fn text_field(value: &Value, name: &str, fallback: &str) -> String {
    value
        .get(name)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

fn directory_size(path: &Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }
    let mut total = 0u64;
    let mut directories = vec![path.to_path_buf()];
    while let Some(directory) = directories.pop() {
        for entry in fs::read_dir(&directory).map_err(display_error("measure AI session"))? {
            let entry = entry.map_err(display_error("measure AI session entry"))?;
            let file_type = entry
                .file_type()
                .map_err(display_error("inspect AI session entry"))?;
            if file_type.is_dir() {
                directories.push(entry.path());
            } else if file_type.is_file() {
                total = total.saturating_add(
                    entry
                        .metadata()
                        .map_err(display_error("measure AI session file"))?
                        .len(),
                );
            }
        }
    }
    Ok(total)
}

fn display_error(action: &'static str) -> impl Fn(std::io::Error) -> String {
    move |error| format!("cannot {action}: {error}")
}

pub fn safe_relative_path(path: &Path) -> bool {
    path.components()
        .all(|component| matches!(component, Component::Normal(_)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_STORE_ID: AtomicU64 = AtomicU64::new(1);

    fn temporary_store() -> AiStore {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let sequence = NEXT_STORE_ID.fetch_add(1, Ordering::Relaxed);
        AiStore::new(std::env::temp_dir().join(format!(
            "makepresentation-ai-{}-{unique}-{sequence}",
            std::process::id()
        )))
    }

    fn session(id: &str, updated_at: &str) -> Value {
        json!({
            "version": 1,
            "id": id,
            "title": format!("Conversation {id}"),
            "createdAt": updated_at,
            "updatedAt": updated_at,
            "status": "readonly",
            "messages": [{"role": "user", "text": "hello"}]
        })
    }

    #[test]
    fn saves_lists_loads_and_deletes_sessions() {
        let store = temporary_store();
        store
            .save_session("one", &session("one", "2026-08-16T01:00:00Z"))
            .unwrap();
        store
            .save_session("two", &session("two", "2026-08-16T02:00:00Z"))
            .unwrap();

        let sessions = store.list_sessions().unwrap();
        assert_eq!(
            sessions
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["two", "one"]
        );
        assert_eq!(
            store.load_session("one").unwrap()["title"],
            "Conversation one"
        );

        store.delete_session("one").unwrap();
        assert_eq!(store.list_sessions().unwrap().len(), 1);
        fs::remove_dir_all(store.root.parent().unwrap()).unwrap();
    }

    #[test]
    fn refuses_a_fourth_session() {
        let store = temporary_store();
        for id in ["one", "two", "three"] {
            store
                .save_session(id, &session(id, "2026-08-16T01:00:00Z"))
                .unwrap();
        }
        let error = store
            .save_session("four", &session("four", "2026-08-16T01:00:00Z"))
            .unwrap_err();
        assert!(error.starts_with("session_count_limit:"));
        fs::remove_dir_all(store.root.parent().unwrap()).unwrap();
    }

    #[test]
    fn rejects_path_components_in_ids() {
        let store = temporary_store();
        assert!(store.session_dir("../outside").is_err());
        assert!(!safe_relative_path(Path::new("../outside")));
        assert!(safe_relative_path(Path::new("images/result.png")));
    }

    #[test]
    fn attaches_only_images_from_an_allowed_source_root() {
        let store = temporary_store();
        store
            .save_session("one", &session("one", "2026-08-16T01:00:00Z"))
            .unwrap();
        let generated = store.root.parent().unwrap().join("generated");
        fs::create_dir_all(&generated).unwrap();
        let source = generated.join("result.png");
        fs::write(&source, b"png-data").unwrap();

        let image = store
            .attach_image(
                "one",
                &source,
                "image-one",
                std::slice::from_ref(&generated),
            )
            .unwrap();
        let saved_image = PathBuf::from(&image.path);
        assert_eq!(image.file_name, "image-one.png");
        assert!(!source.exists());
        assert!(saved_image.exists());

        let outside = store.root.parent().unwrap().join("outside.png");
        fs::write(&outside, b"png-data").unwrap();
        assert!(store
            .attach_image("one", &outside, "image-two", &[generated])
            .unwrap_err()
            .starts_with("invalid_image_source:"));
        store.delete_session("one").unwrap();
        assert!(!saved_image.exists());
        fs::remove_dir_all(store.root.parent().unwrap()).unwrap();
    }

    #[test]
    fn removes_an_oversized_generated_image() {
        let store = temporary_store();
        store
            .save_session("one", &session("one", "2026-08-16T01:00:00Z"))
            .unwrap();
        let generated = store.root.parent().unwrap().join("generated");
        fs::create_dir_all(&generated).unwrap();
        let source = generated.join("oversized.png");
        File::create(&source)
            .unwrap()
            .set_len(SESSION_LIMIT_BYTES)
            .unwrap();

        let error = store
            .attach_image(
                "one",
                &source,
                "image-large",
                std::slice::from_ref(&generated),
            )
            .unwrap_err();
        assert!(error.starts_with("session_limit_exceeded:"));
        assert!(!source.exists());
        fs::remove_dir_all(store.root.parent().unwrap()).unwrap();
    }
}
