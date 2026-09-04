use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentState {
  pub phase: DocumentPhase,
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

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineItem {
  pub id: String,
  pub title: String,
  pub page: u32,
  pub depth: u32,
}

impl DocumentState {
  pub fn empty() -> Self {
    Self {
      phase: DocumentPhase::Empty,
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn empty_state_has_no_document_identity_or_pages() {
    let state = DocumentState::empty();

    assert_eq!(state.phase, DocumentPhase::Empty);
    assert_eq!(state.current_page, 0);
    assert_eq!(state.page_count, 0);
    assert!(state.thumbnails.is_empty());
    assert!(state.outline.is_empty());
  }

  #[test]
  fn serialized_state_matches_the_ui_contract() {
    let value = serde_json::to_value(DocumentState::empty()).unwrap();

    assert_eq!(value["phase"], "empty");
    assert_eq!(value["currentPage"], 0);
    assert_eq!(value["pageCount"], 0);
    assert_eq!(value["errorMessage"], serde_json::Value::Null);
  }
}
