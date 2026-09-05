use serde::Serialize;
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

pub const MAX_SESSIONS: usize = 3;
pub const SESSION_LIMIT_BYTES: u64 = 128 * 1024 * 1024;
pub const SESSION_RESERVE_BYTES: u64 = 4 * 1024;

/// A rendered app image handed to the model as turn input.
pub const MAX_RUNTIME_IMAGE_BYTES: usize = 8 * 1024 * 1024;

/// How many rendered inputs stay on disk. The model reads the file during the
/// turn it was written for, so the previous few are kept rather than deleted
/// straight away, and everything older goes.
pub const KEPT_RUNTIME_IMAGES: usize = 4;

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerInfo {
    pub codex_path: String,
    pub version: String,
    pub running: bool,
}

#[derive(Default)]
pub struct CodexRuntime {
    process: Mutex<Option<AppServerProcess>>,
    generation: Arc<AtomicU64>,
}

struct AppServerProcess {
    child: Child,
    stdin: BufWriter<ChildStdin>,
}

impl Drop for AppServerProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl CodexRuntime {
    pub fn start<Message, Stopped>(
        &self,
        working_directory: &Path,
        on_message: Message,
        on_stopped: Stopped,
    ) -> Result<AppServerInfo, String>
    where
        Message: Fn(Value) + Send + 'static,
        Stopped: Fn() + Send + 'static,
    {
        let mut process = self
            .process
            .lock()
            .map_err(|_| "cannot lock Codex App Server state".to_string())?;
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        *process = None;

        let codex = find_codex().ok_or_else(|| {
            "codex_cli_not_found: install Codex CLI and sign in with ChatGPT".to_string()
        })?;
        let version = codex_version(&codex)?;
        let mut child = Command::new(&codex)
            .args(["app-server", "--listen", "stdio://"])
            .current_dir(working_directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("cannot start Codex App Server: {error}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or("cannot open Codex App Server stdin")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("cannot open Codex App Server stdout")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("cannot open Codex App Server stderr")?;

        let current_generation = Arc::clone(&self.generation);
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let payload = serde_json::from_str::<Value>(&line).unwrap_or_else(
                    |_| json!({ "method": "client/protocolError", "params": { "line": line } }),
                );
                on_message(payload);
            }
            if current_generation.load(Ordering::SeqCst) == generation {
                on_stopped();
            }
        });
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                if line.is_err() {
                    break;
                }
            }
        });

        let info = AppServerInfo {
            codex_path: codex.to_string_lossy().to_string(),
            version,
            running: true,
        };
        *process = Some(AppServerProcess {
            child,
            stdin: BufWriter::new(stdin),
        });
        Ok(info)
    }

    pub fn send_rpc(&self, message: &Value) -> Result<(), String> {
        let mut process = self
            .process
            .lock()
            .map_err(|_| "cannot lock Codex App Server state".to_string())?;
        let server = process
            .as_mut()
            .ok_or("codex_app_server_not_running: start Codex App Server first")?;
        if server
            .child
            .try_wait()
            .map_err(|error| format!("cannot inspect Codex App Server: {error}"))?
            .is_some()
        {
            *process = None;
            return Err("codex_app_server_stopped: restart Codex App Server".into());
        }
        serde_json::to_writer(&mut server.stdin, message)
            .map_err(|error| format!("cannot encode Codex App Server request: {error}"))?;
        server
            .stdin
            .write_all(b"\n")
            .and_then(|_| server.stdin.flush())
            .map_err(|error| format!("cannot send Codex App Server request: {error}"))
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut process = self
            .process
            .lock()
            .map_err(|_| "cannot lock Codex App Server state".to_string())?;
        self.generation.fetch_add(1, Ordering::SeqCst);
        *process = None;
        Ok(())
    }
}

fn find_codex() -> Option<PathBuf> {
    let executable = if cfg!(windows) { "codex.exe" } else { "codex" };
    let mut candidates = std::env::var_os("PATH")
        .map(|value| {
            std::env::split_paths(&value)
                .map(|directory| directory.join(executable))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if cfg!(target_os = "macos") {
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/codex"),
            PathBuf::from("/usr/local/bin/codex"),
        ]);
    }
    candidates.into_iter().find(|path| {
        fs::metadata(path)
            .map(|metadata| metadata.is_file())
            .unwrap_or(false)
    })
}

fn codex_version(path: &Path) -> Result<String, String> {
    let output = Command::new(path)
        .arg("--version")
        .output()
        .map_err(|error| format!("cannot run Codex CLI: {error}"))?;
    if !output.status.success() {
        return Err("cannot read Codex CLI version".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
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

    /// Writes a rendered app image into the runtime directory and returns its path.
    ///
    /// It lands in the runtime root rather than in a session because it is turn
    /// input, not conversation content: it must not count against the 128 MiB a
    /// conversation is allowed, and it must survive the conversation being
    /// deleted mid-turn.
    pub fn save_runtime_png(&self, image_id: &str, data: &[u8]) -> Result<PathBuf, String> {
        validate_id(image_id)?;
        if data.len() > MAX_RUNTIME_IMAGE_BYTES {
            return Err("runtime_image_too_large: rendered image exceeds 8 MiB".into());
        }
        if !data.starts_with(&[0x89, b'P', b'N', b'G']) {
            return Err("runtime_image_not_png: expected a PNG image".into());
        }
        let directory = self.runtime_images_root();
        fs::create_dir_all(&directory)
            .map_err(display_error("create AI runtime image directory"))?;
        let path = directory.join(format!("{image_id}.png"));
        let temporary = directory.join(format!("{image_id}.png.tmp"));
        fs::write(&temporary, data).map_err(display_error("write AI runtime image"))?;
        fs::rename(&temporary, &path).map_err(display_error("replace AI runtime image"))?;
        self.prune_runtime_images()?;
        Ok(path)
    }

    pub fn runtime_images_root(&self) -> PathBuf {
        self.runtime_root().join("images")
    }

    fn prune_runtime_images(&self) -> Result<(), String> {
        let directory = self.runtime_images_root();
        let mut files = Vec::new();
        for entry in fs::read_dir(&directory).map_err(display_error("list AI runtime images"))? {
            let entry = entry.map_err(display_error("read AI runtime image entry"))?;
            let metadata = entry
                .metadata()
                .map_err(display_error("inspect AI runtime image"))?;
            if !metadata.is_file() {
                continue;
            }
            let modified = metadata
                .modified()
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            files.push((modified, entry.path()));
        }
        if files.len() <= KEPT_RUNTIME_IMAGES {
            return Ok(());
        }
        files.sort_by(|left, right| right.0.cmp(&left.0));
        for (_, path) in files.into_iter().skip(KEPT_RUNTIME_IMAGES) {
            let _ = fs::remove_file(path);
        }
        Ok(())
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
            "akbun-ai-{}-{unique}-{sequence}",
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
    fn reserves_space_before_the_session_hard_limit() {
        assert!(ensure_capacity(SESSION_LIMIT_BYTES - SESSION_RESERVE_BYTES).is_ok());
        assert!(ensure_capacity(SESSION_LIMIT_BYTES - SESSION_RESERVE_BYTES + 1).is_err());
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

    const PNG_HEADER: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

    fn png(size: usize) -> Vec<u8> {
        let mut data = PNG_HEADER.to_vec();
        data.resize(size.max(PNG_HEADER.len()), 0);
        data
    }

    #[test]
    fn stores_a_rendered_image_in_the_runtime_directory() {
        let store = temporary_store();
        store.ensure().unwrap();
        let path = store.save_runtime_png("image-one", &png(64)).unwrap();

        assert!(path.exists());
        assert!(path.starts_with(store.runtime_root()));
        // Turn input must not count against the conversation budget, so it
        // lives outside every session directory.
        assert!(!path.starts_with(store.sessions_root()));
    }

    #[test]
    fn rejects_a_runtime_image_that_is_not_a_png() {
        let store = temporary_store();
        store.ensure().unwrap();

        assert!(store
            .save_runtime_png("image-one", b"<svg/>")
            .unwrap_err()
            .starts_with("runtime_image_not_png:"));
        assert!(store
            .save_runtime_png("../escape", &png(64))
            .unwrap_err()
            .starts_with("invalid_session_id:"));
        assert!(store
            .save_runtime_png("image-one", &png(MAX_RUNTIME_IMAGE_BYTES + 1))
            .unwrap_err()
            .starts_with("runtime_image_too_large:"));
    }

    #[test]
    fn keeps_only_the_most_recent_runtime_images() {
        let store = temporary_store();
        store.ensure().unwrap();
        for index in 0..KEPT_RUNTIME_IMAGES + 3 {
            store
                .save_runtime_png(&format!("image-{index}"), &png(64))
                .unwrap();
            // Coarse filesystem timestamps would otherwise make the sort order
            // arbitrary and the pruning look flaky.
            std::thread::sleep(std::time::Duration::from_millis(15));
        }

        let remaining = fs::read_dir(store.runtime_images_root()).unwrap().count();
        assert_eq!(remaining, KEPT_RUNTIME_IMAGES);
        assert!(store
            .runtime_images_root()
            .join(format!("image-{}.png", KEPT_RUNTIME_IMAGES + 2))
            .exists());
        assert!(!store.runtime_images_root().join("image-0.png").exists());
    }
}
