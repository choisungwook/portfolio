use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

pub const DEFAULT_SYSTEM_PROMPT: &str = "사용자가 지정한 PDF 페이지를 요약한다. 문서의 언어를 유지하고 핵심 주장, 근거, 수치, 결정, 후속 조치를 구분한다. 각 내용의 근거가 되는 페이지 번호를 표시한다. 페이지 이미지와 추출 텍스트가 다르면 이미지에서 확인되는 내용을 우선하되, 보이지 않거나 불확실한 내용은 추측하지 않는다. 여러 묶음의 중간 요약을 받으면 중복을 제거하고 문서의 전체 흐름을 보존한 최종 요약을 작성한다.";

const SETTINGS_VERSION: u32 = 1;
const MAX_TITLE_CHARS: usize = 120;
const MAX_PROMPT_CHARS: usize = 20_000;
const MAX_MESSAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_CONVERSATION_BYTES: u64 = 64 * 1024 * 1024;
const MODELS: [&str; 3] = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"];

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub version: u32,
    pub provider: String,
    pub model: String,
    pub effort: String,
    pub system_prompt: String,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            provider: "codex".into(),
            model: "gpt-5.6-luna".into(),
            effort: "low".into(),
            system_prompt: DEFAULT_SYSTEM_PROMPT.into(),
        }
    }
}

impl AiSettings {
    pub fn normalized(mut self) -> Self {
        self.version = SETTINGS_VERSION;
        self.provider = "codex".into();
        if !MODELS.contains(&self.model.as_str()) {
            self.model = "gpt-5.6-luna".into();
        }
        self.effort = "low".into();
        self.system_prompt = trimmed(self.system_prompt, MAX_PROMPT_CHARS);
        if self.system_prompt.is_empty() {
            self.system_prompt = DEFAULT_SYSTEM_PROMPT.into();
        }
        self
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMeta {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: usize,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessage {
    pub id: String,
    pub role: String,
    pub text: String,
    pub created_at: String,
    #[serde(default)]
    pub pages: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub meta: ConversationMeta,
    pub messages: Vec<ConversationMessage>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum JsonlRecord {
    Conversation {
        id: String,
        title: String,
        #[serde(rename = "createdAt")]
        created_at: String,
    },
    Message {
        id: String,
        role: String,
        text: String,
        #[serde(rename = "createdAt")]
        created_at: String,
        #[serde(default)]
        pages: Vec<u32>,
    },
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
        fs::create_dir_all(self.conversations_root()).map_err(io_error("create conversations"))?;
        fs::create_dir_all(self.requests_root()).map_err(io_error("create AI runtime"))
    }

    pub fn runtime_root(&self) -> PathBuf {
        self.root.join("runtime")
    }

    pub fn load_settings(&self) -> Result<AiSettings, String> {
        self.ensure()?;
        let path = self.root.join("settings.json");
        if !path.exists() {
            return Ok(AiSettings::default());
        }
        let text = fs::read_to_string(path).map_err(io_error("read AI settings"))?;
        serde_json::from_str::<AiSettings>(&text)
            .map(AiSettings::normalized)
            .map_err(|error| format!("cannot parse AI settings: {error}"))
    }

    pub fn save_settings(&self, settings: AiSettings) -> Result<AiSettings, String> {
        self.ensure()?;
        let settings = settings.normalized();
        let bytes = serde_json::to_vec_pretty(&settings)
            .map_err(|error| format!("cannot encode AI settings: {error}"))?;
        atomic_write(&self.root.join("settings.json"), &bytes)?;
        Ok(settings)
    }

    pub fn create_conversation(
        &self,
        id: String,
        title: String,
        created_at: String,
    ) -> Result<Conversation, String> {
        self.ensure()?;
        validate_id(&id)?;
        let path = self.conversation_path(&id)?;
        if path.exists() {
            return Err("conversation_exists: choose a new conversation id".into());
        }
        let title = conversation_title(title);
        let record = JsonlRecord::Conversation {
            id: id.clone(),
            title: title.clone(),
            created_at: created_at.clone(),
        };
        write_records(&path, &[record])?;
        Ok(Conversation {
            meta: ConversationMeta {
                id,
                title,
                created_at: created_at.clone(),
                updated_at: created_at,
                message_count: 0,
            },
            messages: Vec::new(),
        })
    }

    pub fn list_conversations(&self) -> Result<Vec<ConversationMeta>, String> {
        self.ensure()?;
        let mut conversations = fs::read_dir(self.conversations_root())
            .map_err(io_error("list conversations"))?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.path().extension().and_then(|value| value.to_str()) == Some("jsonl")
            })
            .filter_map(|entry| self.load_path(&entry.path()).ok().map(|item| item.meta))
            .collect::<Vec<_>>();
        conversations.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        Ok(conversations)
    }

    pub fn load_conversation(&self, id: &str) -> Result<Conversation, String> {
        self.load_path(&self.conversation_path(id)?)
    }

    pub fn append_message(
        &self,
        conversation_id: &str,
        message: ConversationMessage,
    ) -> Result<ConversationMeta, String> {
        validate_id(conversation_id)?;
        validate_id(&message.id)?;
        if !matches!(message.role.as_str(), "user" | "assistant") {
            return Err("invalid_message_role: expected user or assistant".into());
        }
        if message.text.is_empty() || message.text.len() > MAX_MESSAGE_BYTES {
            return Err("invalid_message_text: message is empty or too large".into());
        }
        let path = self.conversation_path(conversation_id)?;
        let current = self.load_path(&path)?;
        let record = JsonlRecord::Message {
            id: message.id,
            role: message.role,
            text: message.text,
            created_at: message.created_at,
            pages: message.pages,
        };
        let line = serde_json::to_vec(&record)
            .map_err(|error| format!("cannot encode conversation message: {error}"))?;
        let current_size = fs::metadata(&path)
            .map_err(io_error("inspect conversation"))?
            .len();
        if current_size + line.len() as u64 + 1 > MAX_CONVERSATION_BYTES {
            return Err("conversation_limit_exceeded: conversation exceeds 64 MiB".into());
        }
        let mut file = OpenOptions::new()
            .append(true)
            .open(&path)
            .map_err(io_error("open conversation"))?;
        file.write_all(&line)
            .and_then(|_| file.write_all(b"\n"))
            .and_then(|_| file.flush())
            .map_err(io_error("append conversation"))?;
        self.load_path(&path).map(|conversation| ConversationMeta {
            message_count: current.meta.message_count + 1,
            ..conversation.meta
        })
    }

    pub fn rename_conversation(&self, id: &str, title: String) -> Result<ConversationMeta, String> {
        let path = self.conversation_path(id)?;
        let conversation = self.load_path(&path)?;
        let title = conversation_title(title);
        let mut records = read_records(&path)?;
        records[0] = JsonlRecord::Conversation {
            id: conversation.meta.id,
            title,
            created_at: conversation.meta.created_at,
        };
        write_records(&path, &records)?;
        self.load_path(&path).map(|item| item.meta)
    }

    pub fn delete_conversation(&self, id: &str) -> Result<(), String> {
        let path = self.conversation_path(id)?;
        if path.exists() {
            fs::remove_file(path).map_err(io_error("delete conversation"))?;
        }
        Ok(())
    }

    pub fn save_page_image(
        &self,
        request_id: &str,
        page: u32,
        bytes: &[u8],
    ) -> Result<PathBuf, String> {
        validate_id(request_id)?;
        if page == 0
            || bytes.len() > 12 * 1024 * 1024
            || !bytes.starts_with(&[0x89, b'P', b'N', b'G'])
        {
            return Err("invalid_page_image: expected a PNG up to 12 MiB".into());
        }
        let directory = self.requests_root().join(request_id);
        fs::create_dir_all(&directory).map_err(io_error("create summary request"))?;
        let path = directory.join(format!("page-{page}.png"));
        atomic_write(&path, bytes)?;
        Ok(path)
    }

    pub fn clear_request(&self, request_id: &str) -> Result<(), String> {
        validate_id(request_id)?;
        let path = self.requests_root().join(request_id);
        if path.exists() {
            fs::remove_dir_all(path).map_err(io_error("clear summary request"))?;
        }
        Ok(())
    }

    pub fn clear_runtime(&self) -> Result<(), String> {
        let path = self.requests_root();
        if path.exists() {
            fs::remove_dir_all(&path).map_err(io_error("clear AI runtime"))?;
        }
        fs::create_dir_all(path).map_err(io_error("create AI runtime"))
    }

    fn conversations_root(&self) -> PathBuf {
        self.root.join("conversations")
    }

    fn requests_root(&self) -> PathBuf {
        self.runtime_root().join("requests")
    }

    fn conversation_path(&self, id: &str) -> Result<PathBuf, String> {
        validate_id(id)?;
        Ok(self.conversations_root().join(format!("{id}.jsonl")))
    }

    fn load_path(&self, path: &Path) -> Result<Conversation, String> {
        let records = read_records(path)?;
        let Some(JsonlRecord::Conversation {
            id,
            title,
            created_at,
        }) = records.first()
        else {
            return Err("invalid_conversation: missing metadata record".into());
        };
        let messages = records
            .iter()
            .skip(1)
            .filter_map(|record| match record {
                JsonlRecord::Message {
                    id,
                    role,
                    text,
                    created_at,
                    pages,
                } => Some(ConversationMessage {
                    id: id.clone(),
                    role: role.clone(),
                    text: text.clone(),
                    created_at: created_at.clone(),
                    pages: pages.clone(),
                }),
                JsonlRecord::Conversation { .. } => None,
            })
            .collect::<Vec<_>>();
        let updated_at = messages
            .last()
            .map(|message| message.created_at.clone())
            .unwrap_or_else(|| created_at.clone());
        Ok(Conversation {
            meta: ConversationMeta {
                id: id.clone(),
                title: title.clone(),
                created_at: created_at.clone(),
                updated_at,
                message_count: messages.len(),
            },
            messages,
        })
    }
}

fn read_records(path: &Path) -> Result<Vec<JsonlRecord>, String> {
    let text = fs::read_to_string(path).map_err(io_error("read conversation"))?;
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            serde_json::from_str(line)
                .map_err(|error| format!("cannot parse conversation: {error}"))
        })
        .collect()
}

fn write_records(path: &Path, records: &[JsonlRecord]) -> Result<(), String> {
    let mut bytes = Vec::new();
    for record in records {
        serde_json::to_writer(&mut bytes, record)
            .map_err(|error| format!("cannot encode conversation: {error}"))?;
        bytes.push(b'\n');
    }
    atomic_write(path, &bytes)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|directory| !directory.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .ok_or_else(|| "cannot determine AI data file name".to_string())?;
    let temporary = temporary_path(parent, file_name)?;
    let result = write_and_replace(&temporary, path, bytes);
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn temporary_path(parent: &Path, file_name: &std::ffi::OsStr) -> Result<PathBuf, String> {
    for attempt in 0..100_u32 {
        let candidate = parent.join(format!(
            ".{}.pdf-ai-{}-{attempt}.tmp",
            file_name.to_string_lossy(),
            std::process::id(),
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("cannot create temporary AI data path".into())
}

fn write_and_replace(temporary: &Path, target: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temporary)
        .map_err(io_error("create temporary AI data"))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(io_error("write temporary AI data"))?;
    drop(file);
    replace_file(temporary, target)
}

#[cfg(not(windows))]
fn replace_file(temporary: &Path, target: &Path) -> Result<(), String> {
    fs::rename(temporary, target).map_err(io_error("replace AI data"))
}

#[cfg(windows)]
fn replace_file(temporary: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, ReplaceFileW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        REPLACEFILE_WRITE_THROUGH,
    };

    let wide = |path: &Path| {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>()
    };
    let temporary_wide = wide(temporary);
    let target_wide = wide(target);
    let success = unsafe {
        if target.exists() {
            ReplaceFileW(
                target_wide.as_ptr(),
                temporary_wide.as_ptr(),
                std::ptr::null(),
                REPLACEFILE_WRITE_THROUGH,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        } else {
            MoveFileExW(
                temporary_wide.as_ptr(),
                target_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        }
    };
    if success == 0 {
        return Err(format!("cannot replace AI data: {}", unsafe {
            GetLastError()
        }));
    }
    Ok(())
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 64
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("invalid_id: expected 1-64 letters, digits, hyphens, or underscores".into());
    }
    Ok(())
}

fn conversation_title(value: String) -> String {
    let title = trimmed(value, MAX_TITLE_CHARS);
    if title.is_empty() {
        "새 대화".into()
    } else {
        title
    }
}

fn trimmed(value: String, max_chars: usize) -> String {
    value.trim().chars().take(max_chars).collect()
}

fn io_error(action: &'static str) -> impl Fn(std::io::Error) -> String {
    move |error| format!("cannot {action}: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn store() -> AiStore {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        AiStore::new(std::env::temp_dir().join(format!("pdf-ai-{unique}")))
    }

    #[test]
    fn defaults_to_luna_low_and_normalizes_unknown_values() {
        let settings = AiSettings {
            version: 99,
            provider: "local".into(),
            model: "unknown".into(),
            effort: "max".into(),
            system_prompt: "  ".into(),
        }
        .normalized();

        assert_eq!(settings, AiSettings::default());
    }

    #[test]
    fn persists_jsonl_conversations_and_renames_them() {
        let store = store();
        let created = store
            .create_conversation(
                "chat-1".into(),
                "첫 대화".into(),
                "2026-09-05T00:00:00Z".into(),
            )
            .unwrap();
        assert_eq!(created.meta.message_count, 0);

        store
            .append_message(
                "chat-1",
                ConversationMessage {
                    id: "message-1".into(),
                    role: "user".into(),
                    text: "1페이지를 요약해 줘".into(),
                    created_at: "2026-09-05T00:01:00Z".into(),
                    pages: vec![1],
                },
            )
            .unwrap();
        let renamed = store
            .rename_conversation("chat-1", "요약 노트".into())
            .unwrap();
        assert_eq!(renamed.title, "요약 노트");

        let loaded = store.load_conversation("chat-1").unwrap();
        assert_eq!(loaded.messages.len(), 1);
        assert_eq!(loaded.messages[0].pages, vec![1]);
        assert_eq!(store.list_conversations().unwrap()[0].message_count, 1);
    }

    #[test]
    fn rejects_path_like_ids() {
        let store = store();
        assert!(store.load_conversation("../settings").is_err());
    }
}
