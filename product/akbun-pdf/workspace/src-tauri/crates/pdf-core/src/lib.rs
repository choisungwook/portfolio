use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentState {
    pub phase: DocumentPhase,
    pub document_id: Option<String>,
    pub title: String,
    pub current_page: u32,
    pub page_count: u32,
    pub zoom: f32,
    pub thumbnails: Vec<Thumbnail>,
    pub outline: Vec<OutlineItem>,
    pub error_message: Option<String>,
}

impl Default for DocumentState {
    fn default() -> Self {
        Self::empty()
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DocumentPhase {
    #[default]
    Empty,
    Loading,
    Ready,
    Error,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Thumbnail {
    pub page: u32,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineItem {
    pub id: String,
    pub title: String,
    pub page: u32,
    pub top: Option<f32>,
    pub depth: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenDocument {
    pub state: DocumentState,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreservationReport {
    pub original_size: usize,
    pub saved_size: usize,
    pub original_hash: String,
    pub saved_hash: String,
    pub unchanged: bool,
}

#[derive(Default)]
pub struct DocumentStore {
    next_id: u64,
    session: Option<DocumentSession>,
}

struct DocumentSession {
    state: DocumentState,
    bytes: Vec<u8>,
}

impl DocumentState {
    pub fn empty() -> Self {
        Self {
            phase: DocumentPhase::Empty,
            document_id: None,
            title: "akbun-pdf".into(),
            current_page: 0,
            page_count: 0,
            zoom: 1.0,
            thumbnails: Vec::new(),
            outline: Vec::new(),
            error_message: None,
        }
    }
}

impl DocumentStore {
    pub fn state(&self) -> DocumentState {
        self.session
            .as_ref()
            .map(|session| session.state.clone())
            .unwrap_or_default()
    }

    pub fn open(&mut self, title: String, bytes: Vec<u8>) -> Result<OpenDocument, String> {
        if !bytes.starts_with(b"%PDF-") {
            return Err("PDF 파일 형식이 아닙니다.".into());
        }

        self.next_id += 1;
        let document_id = format!("document-{}", self.next_id);
        let state = DocumentState {
            phase: DocumentPhase::Loading,
            document_id: Some(document_id),
            title,
            ..DocumentState::empty()
        };
        self.session = Some(DocumentSession {
            state: state.clone(),
            bytes: bytes.clone(),
        });
        Ok(OpenDocument { state, bytes })
    }

    pub fn complete(
        &mut self,
        document_id: &str,
        page_count: u32,
        outline: Vec<OutlineItem>,
    ) -> Result<DocumentState, String> {
        if page_count == 0 {
            return Err("페이지가 없는 PDF입니다.".into());
        }

        let session = self.session_mut(document_id)?;
        session.state.phase = DocumentPhase::Ready;
        session.state.current_page = 1;
        session.state.page_count = page_count;
        session.state.thumbnails = (1..=page_count)
            .map(|page| Thumbnail {
                page,
                label: format!("{page}페이지"),
            })
            .collect();
        session.state.outline = outline;
        session.state.error_message = None;
        Ok(session.state.clone())
    }

    pub fn fail(&mut self, document_id: &str, message: String) -> Result<DocumentState, String> {
        let session = self.session_mut(document_id)?;
        session.state.phase = DocumentPhase::Error;
        session.state.current_page = 0;
        session.state.page_count = 0;
        session.state.thumbnails.clear();
        session.state.outline.clear();
        session.state.error_message = Some(message);
        session.state.document_id = None;
        session.bytes.clear();
        session.bytes.shrink_to_fit();
        Ok(session.state.clone())
    }

    pub fn bytes(&self, document_id: &str) -> Result<&[u8], String> {
        Ok(&self.session(document_id)?.bytes)
    }

    pub fn close(&mut self) -> DocumentState {
        self.session = None;
        DocumentState::empty()
    }

    fn session(&self, document_id: &str) -> Result<&DocumentSession, String> {
        self.session
            .as_ref()
            .filter(|session| session.state.document_id.as_deref() == Some(document_id))
            .ok_or_else(|| "열린 문서 세션을 찾을 수 없습니다.".into())
    }

    fn session_mut(&mut self, document_id: &str) -> Result<&mut DocumentSession, String> {
        self.session
            .as_mut()
            .filter(|session| session.state.document_id.as_deref() == Some(document_id))
            .ok_or_else(|| "열린 문서 세션을 찾을 수 없습니다.".into())
    }
}

fn stable_hash(bytes: &[u8]) -> String {
    let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    format!("{hash:016x}")
}

pub fn preservation_report(original: &[u8], saved: &[u8]) -> PreservationReport {
    let original_hash = stable_hash(original);
    let saved_hash = stable_hash(saved);
    PreservationReport {
        original_size: original.len(),
        saved_size: saved.len(),
        unchanged: original.len() == saved.len() && original_hash == saved_hash,
        original_hash,
        saved_hash,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PDF: &[u8] = b"%PDF-1.7\n1 0 obj<</Length 5>>stream\nhello\nendstream\nendobj\n%%EOF";

    #[test]
    fn empty_state_has_no_document_identity_or_pages() {
        let state = DocumentState::empty();
        assert_eq!(state.phase, DocumentPhase::Empty);
        assert_eq!(state.document_id, None);
        assert_eq!(state.current_page, 0);
        assert_eq!(state.page_count, 0);
    }

    #[test]
    fn opening_a_second_document_releases_the_previous_session() {
        let mut store = DocumentStore::default();
        let first = store.open("first.pdf".into(), PDF.to_vec()).unwrap();
        let second = store.open("second.pdf".into(), PDF.to_vec()).unwrap();
        assert_ne!(first.state.document_id, second.state.document_id);
        assert!(store
            .bytes(first.state.document_id.as_deref().unwrap())
            .is_err());
    }

    #[test]
    fn unchanged_save_preserves_stream_bytes_and_file_size() {
        let mut store = DocumentStore::default();
        let opened = store.open("sample.pdf".into(), PDF.to_vec()).unwrap();
        let id = opened.state.document_id.as_deref().unwrap();
        let saved = store.bytes(id).unwrap().to_vec();
        let report = preservation_report(store.bytes(id).unwrap(), &saved);
        assert!(report.unchanged);
        assert_eq!(report.original_size, report.saved_size);
        assert_eq!(report.original_hash, report.saved_hash);
        assert!(String::from_utf8(saved)
            .unwrap()
            .contains("stream\nhello\nendstream"));
    }

    #[test]
    fn closing_releases_bytes_and_returns_empty_state() {
        let mut store = DocumentStore::default();
        let opened = store.open("sample.pdf".into(), PDF.to_vec()).unwrap();
        let id = opened.state.document_id.unwrap();
        assert_eq!(store.close(), DocumentState::empty());
        assert!(store.bytes(&id).is_err());
    }

    #[test]
    fn failed_open_releases_the_original_buffer() {
        let mut store = DocumentStore::default();
        let opened = store.open("sample.pdf".into(), PDF.to_vec()).unwrap();
        let id = opened.state.document_id.unwrap();
        let failed = store.fail(&id, "broken PDF".into()).unwrap();
        assert_eq!(failed.phase, DocumentPhase::Error);
        assert_eq!(failed.document_id, None);
        assert!(store.bytes(&id).is_err());
    }

    #[test]
    fn serialized_state_matches_the_ui_contract() {
        let value = serde_json::to_value(DocumentState::empty()).unwrap();
        assert_eq!(value["phase"], "empty");
        assert_eq!(value["documentId"], serde_json::Value::Null);
        assert_eq!(value["currentPage"], 0);
        assert_eq!(value["errorMessage"], serde_json::Value::Null);
    }
}
