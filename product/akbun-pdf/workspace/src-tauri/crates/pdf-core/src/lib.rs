mod annotations;
mod edit;
mod merge;
mod state;

pub use merge::{inspect_pdf, merge_documents, MergeReport};
pub use state::*;

use annotations::read_annotations;
use edit::{load_pdf, render_document};

#[derive(Default)]
pub struct DocumentStore {
    next_id: u64,
    next_annotation_id: u64,
    session: Option<DocumentSession>,
}

struct DocumentSession {
    state: DocumentState,
    bytes: Vec<u8>,
}

impl DocumentStore {
    pub fn state(&self) -> DocumentState {
        self.session
            .as_ref()
            .map(|session| session.state.clone())
            .unwrap_or_default()
    }

    pub fn open(&mut self, title: String, bytes: Vec<u8>) -> Result<OpenDocument, String> {
        load_pdf(&bytes)?;
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
        let session = self.session_mut(document_id)?;
        let document = load_pdf(&session.bytes)?;
        let parsed_count = document.get_pages().len() as u32;
        if page_count == 0 || page_count != parsed_count {
            return Err("PDF 페이지 정보를 확인할 수 없습니다.".into());
        }
        session.state.phase = DocumentPhase::Ready;
        session.state.current_page = 1;
        session.state.page_count = page_count;
        session.state.dirty = false;
        session.state.thumbnails = thumbnails(page_count);
        session.state.outline = outline
            .into_iter()
            .map(|mut item| {
                item.source_page = item.page;
                item
            })
            .collect();
        session.state.annotations = read_annotations(&document);
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
        session.state.annotations.clear();
        session.state.error_message = Some(message);
        session.state.document_id = None;
        session.bytes.clear();
        session.bytes.shrink_to_fit();
        Ok(session.state.clone())
    }

    pub fn reorder_page(
        &mut self,
        document_id: &str,
        from_page: u32,
        to_page: u32,
    ) -> Result<DocumentState, String> {
        let session = self.ready_session_mut(document_id)?;
        let from = page_index(from_page, session.state.page_count)?;
        let to = page_index(to_page, session.state.page_count)?;
        let selected_source =
            session.state.thumbnails[session.state.current_page as usize - 1].source_page;
        if from != to {
            let page = session.state.thumbnails.remove(from);
            session.state.thumbnails.insert(to, page);
            mark_dirty(&mut session.state);
        }
        normalize_page_numbers(&mut session.state);
        if let Some(index) = session
            .state
            .thumbnails
            .iter()
            .position(|page| page.source_page == selected_source)
        {
            session.state.current_page = index as u32 + 1;
        }
        Ok(session.state.clone())
    }

    pub fn delete_page(&mut self, document_id: &str, page: u32) -> Result<DocumentState, String> {
        let session = self.ready_session_mut(document_id)?;
        if session.state.page_count <= 1 {
            return Err("문서에는 페이지가 한 장 이상 있어야 합니다.".into());
        }
        let index = page_index(page, session.state.page_count)?;
        let removed = session.state.thumbnails.remove(index);
        session
            .state
            .annotations
            .retain(|annotation| annotation.source_page != removed.source_page);
        mark_dirty(&mut session.state);
        normalize_page_numbers(&mut session.state);
        Ok(session.state.clone())
    }

    pub fn rotate_page(
        &mut self,
        document_id: &str,
        page: u32,
        degrees: i32,
    ) -> Result<DocumentState, String> {
        if !matches!(degrees, -90 | 90) {
            return Err("페이지는 90도 단위로만 회전할 수 있습니다.".into());
        }
        let session = self.ready_session_mut(document_id)?;
        let index = page_index(page, session.state.page_count)?;
        session.state.thumbnails[index].rotation =
            (session.state.thumbnails[index].rotation + degrees).rem_euclid(360);
        mark_dirty(&mut session.state);
        Ok(session.state.clone())
    }

    pub fn upsert_annotation(
        &mut self,
        document_id: &str,
        draft: AnnotationDraft,
    ) -> Result<DocumentState, String> {
        let source_page = {
            let session = self.ready_session(document_id)?;
            let index = page_index(draft.page, session.state.page_count)?;
            session.state.thumbnails[index].source_page
        };
        let id = draft.id.unwrap_or_else(|| {
            self.next_annotation_id += 1;
            format!("annotation-{}", self.next_annotation_id)
        });
        let session = self.ready_session_mut(document_id)?;
        let annotation = Annotation {
            id: id.clone(),
            page: draft.page,
            kind: draft.kind,
            rect: draft.rect,
            color: draft.color,
            contents: draft.contents,
            source_page,
        };
        if let Some(existing) = session
            .state
            .annotations
            .iter_mut()
            .find(|item| item.id == id)
        {
            *existing = annotation;
        } else {
            session.state.annotations.push(annotation);
        }
        mark_dirty(&mut session.state);
        Ok(session.state.clone())
    }

    pub fn delete_annotation(
        &mut self,
        document_id: &str,
        annotation_id: &str,
    ) -> Result<DocumentState, String> {
        let session = self.ready_session_mut(document_id)?;
        let before = session.state.annotations.len();
        session
            .state
            .annotations
            .retain(|item| item.id != annotation_id);
        if session.state.annotations.len() == before {
            return Err("주석을 찾을 수 없습니다.".into());
        }
        mark_dirty(&mut session.state);
        Ok(session.state.clone())
    }

    pub fn rendered_bytes(
        &self,
        document_id: &str,
    ) -> Result<(Vec<u8>, PreservationReport), String> {
        let session = self.ready_session(document_id)?;
        if !session.state.dirty {
            let bytes = session.bytes.clone();
            return Ok((
                bytes.clone(),
                preservation_report(&bytes, &bytes, true, true),
            ));
        }
        let (saved, streams_preserved) = render_document(
            &session.bytes,
            &session.state.thumbnails,
            &session.state.annotations,
        )?;
        let report = preservation_report(&session.bytes, &saved, streams_preserved, true);
        Ok((saved, report))
    }

    pub fn commit_saved(
        &mut self,
        document_id: &str,
        bytes: Vec<u8>,
    ) -> Result<DocumentState, String> {
        let session = self.ready_session_mut(document_id)?;
        session.bytes = bytes;
        session.state.dirty = false;
        for (index, page) in session.state.thumbnails.iter_mut().enumerate() {
            page.source_page = index as u32 + 1;
            page.rotation = 0;
        }
        for annotation in &mut session.state.annotations {
            annotation.source_page = annotation.page;
        }
        Ok(session.state.clone())
    }

    pub fn bytes(&self, document_id: &str) -> Result<&[u8], String> {
        Ok(&self.session(document_id)?.bytes)
    }

    pub fn close(&mut self) -> DocumentState {
        self.session = None;
        DocumentState::empty()
    }

    fn ready_session(&self, document_id: &str) -> Result<&DocumentSession, String> {
        let session = self.session(document_id)?;
        if session.state.phase != DocumentPhase::Ready {
            return Err("문서가 아직 준비되지 않았습니다.".into());
        }
        Ok(session)
    }

    fn ready_session_mut(&mut self, document_id: &str) -> Result<&mut DocumentSession, String> {
        let session = self.session_mut(document_id)?;
        if session.state.phase != DocumentPhase::Ready {
            return Err("문서가 아직 준비되지 않았습니다.".into());
        }
        Ok(session)
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

fn thumbnails(page_count: u32) -> Vec<Thumbnail> {
    (1..=page_count)
        .map(|page| Thumbnail {
            page,
            source_page: page,
            rotation: 0,
            label: format!("{page}페이지"),
        })
        .collect()
}

fn page_index(page: u32, page_count: u32) -> Result<usize, String> {
    if page == 0 || page > page_count {
        return Err("페이지 범위를 벗어났습니다.".into());
    }
    Ok(page as usize - 1)
}

fn mark_dirty(state: &mut DocumentState) {
    state.dirty = true;
}

fn normalize_page_numbers(state: &mut DocumentState) {
    state.page_count = state.thumbnails.len() as u32;
    for (index, thumbnail) in state.thumbnails.iter_mut().enumerate() {
        thumbnail.page = index as u32 + 1;
        thumbnail.label = format!("{}페이지", thumbnail.page);
    }
    for annotation in &mut state.annotations {
        if let Some(index) = state
            .thumbnails
            .iter()
            .position(|page| page.source_page == annotation.source_page)
        {
            annotation.page = index as u32 + 1;
        }
    }
    state.current_page = state.current_page.min(state.page_count).max(1);
    for item in &mut state.outline {
        if let Some(index) = state
            .thumbnails
            .iter()
            .position(|page| page.source_page == item.source_page)
        {
            item.page = index as u32 + 1;
        } else {
            item.page = 0;
        }
    }
    state.outline.retain(|item| item.page > 0);
}

fn stable_hash(bytes: &[u8]) -> String {
    let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    format!("{hash:016x}")
}

pub fn preservation_report(
    original: &[u8],
    saved: &[u8],
    content_streams_preserved: bool,
    object_streams_preserved: bool,
) -> PreservationReport {
    let original_hash = stable_hash(original);
    let saved_hash = stable_hash(saved);
    PreservationReport {
        original_size: original.len(),
        saved_size: saved.len(),
        unchanged: original.len() == saved.len() && original_hash == saved_hash,
        original_hash,
        saved_hash,
        content_streams_preserved,
        object_streams_preserved,
    }
}

#[cfg(test)]
mod tests;
