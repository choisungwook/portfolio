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
    pub dirty: bool,
    pub thumbnails: Vec<Thumbnail>,
    pub outline: Vec<OutlineItem>,
    pub annotations: Vec<Annotation>,
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
    pub source_page: u32,
    pub rotation: i32,
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
    #[serde(skip)]
    pub(crate) source_page: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRect {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AnnotationKind {
    Highlight,
    Note,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub page: u32,
    pub kind: AnnotationKind,
    pub rect: PdfRect,
    pub color: String,
    pub contents: String,
    #[serde(skip)]
    pub(crate) source_page: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationDraft {
    pub id: Option<String>,
    pub page: u32,
    pub kind: AnnotationKind,
    pub rect: PdfRect,
    pub color: String,
    pub contents: String,
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
    pub content_streams_preserved: bool,
    pub object_streams_preserved: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub state: DocumentState,
    pub bytes: Vec<u8>,
    pub report: PreservationReport,
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
            dirty: false,
            thumbnails: Vec::new(),
            outline: Vec::new(),
            annotations: Vec::new(),
            error_message: None,
        }
    }
}
