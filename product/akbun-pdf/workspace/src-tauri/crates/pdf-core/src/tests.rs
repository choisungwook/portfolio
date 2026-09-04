use lopdf::{dictionary, Document, Object, Stream};

use super::*;

fn sample_pdf(labels: &[&str]) -> Vec<u8> {
    let mut document = Document::with_version("1.7");
    let pages_id = document.new_object_id();
    let mut page_ids = Vec::new();
    for label in labels {
        let mut stream = Stream::new(dictionary! {}, label.as_bytes().to_vec());
        stream.compress().unwrap();
        let content_id = document.add_object(stream);
        let page_id = document.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            "Resources" => dictionary! {},
            "Contents" => content_id,
        });
        page_ids.push(page_id);
    }
    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.into_iter().map(Object::Reference).collect::<Vec<_>>(),
            "Count" => labels.len() as i64,
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    let mut bytes = Vec::new();
    document.save_modern(&mut bytes).unwrap();
    bytes
}

fn ready_store() -> (DocumentStore, String) {
    let mut store = DocumentStore::default();
    let opened = store
        .open(
            "sample.pdf".into(),
            sample_pdf(&["first", "second", "third"]),
        )
        .unwrap();
    let id = opened.state.document_id.unwrap();
    store.complete(&id, 3, Vec::new()).unwrap();
    (store, id)
}

#[test]
fn page_edits_remain_pending_until_rendered() {
    let (mut store, id) = ready_store();
    let original = store.bytes(&id).unwrap().to_vec();
    store.reorder_page(&id, 3, 1).unwrap();
    assert_eq!(store.state().current_page, 2);
    store.rotate_page(&id, 1, 90).unwrap();
    store.delete_page(&id, 3).unwrap();

    assert_eq!(store.bytes(&id).unwrap(), original);
    assert!(store.state().dirty);
    assert_eq!(
        store
            .state()
            .thumbnails
            .iter()
            .map(|page| page.source_page)
            .collect::<Vec<_>>(),
        vec![3, 1],
    );

    let (saved, report) = store.rendered_bytes(&id).unwrap();
    let document = Document::load_mem(&saved).unwrap();
    assert_eq!(document.get_pages().len(), 2);
    let first_id = document.get_pages()[&1];
    assert_eq!(document.get_page_content(first_id), b"third\n");
    let rotation = document
        .get_object(first_id)
        .unwrap()
        .as_dict()
        .unwrap()
        .get(b"Rotate")
        .unwrap()
        .as_i64()
        .unwrap();
    assert_eq!(rotation, 90);
    assert!(saved.starts_with(&original));
    assert!(report.content_streams_preserved);
    assert!(report.object_streams_preserved);
}

#[test]
fn outlines_follow_reordered_pages_and_drop_deleted_destinations() {
    let mut store = DocumentStore::default();
    let opened = store
        .open("outline.pdf".into(), sample_pdf(&["first", "second"]))
        .unwrap();
    let id = opened.state.document_id.unwrap();
    store
        .complete(
            &id,
            2,
            vec![OutlineItem {
                id: "chapter".into(),
                title: "Chapter".into(),
                page: 2,
                top: None,
                depth: 0,
                source_page: 0,
            }],
        )
        .unwrap();
    assert_eq!(store.reorder_page(&id, 2, 1).unwrap().outline[0].page, 1);
    assert!(store.delete_page(&id, 1).unwrap().outline.is_empty());
}

#[test]
fn standard_annotations_round_trip_with_unicode_contents() {
    let (mut store, id) = ready_store();
    let state = store
        .upsert_annotation(
            &id,
            AnnotationDraft {
                id: None,
                page: 1,
                kind: AnnotationKind::Highlight,
                rect: PdfRect {
                    x1: 10.0,
                    y1: 20.0,
                    x2: 110.0,
                    y2: 36.0,
                },
                color: "#ffd54f".into(),
                contents: "중요한 문장".into(),
            },
        )
        .unwrap();
    assert!(state.dirty);

    let (saved, _) = store.rendered_bytes(&id).unwrap();
    let mut reopened = DocumentStore::default();
    let opened = reopened.open("annotated.pdf".into(), saved).unwrap();
    let reopened_id = opened.state.document_id.unwrap();
    let state = reopened.complete(&reopened_id, 3, Vec::new()).unwrap();
    assert_eq!(state.annotations.len(), 1);
    assert_eq!(state.annotations[0].kind, AnnotationKind::Highlight);
    assert_eq!(state.annotations[0].contents, "중요한 문장");
    let document = Document::load_mem(reopened.bytes(&reopened_id).unwrap()).unwrap();
    let annotation = document
        .get_page_annotations(document.get_pages()[&1])
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    assert_eq!(
        annotation.get(b"Subtype").unwrap().as_name().unwrap(),
        b"Highlight"
    );
    assert!(annotation.has(b"QuadPoints"));
    assert!(annotation.has(b"AP"));
}

#[test]
fn unchanged_save_preserves_every_byte() {
    let (store, id) = ready_store();
    let original = store.bytes(&id).unwrap();
    let (saved, report) = store.rendered_bytes(&id).unwrap();
    assert_eq!(saved, original);
    assert!(report.unchanged);
    assert!(report.content_streams_preserved);
}

#[test]
fn merge_keeps_file_order_and_stream_bytes() {
    let first = sample_pdf(&["one", "two"]);
    let second = sample_pdf(&["three"]);
    let (saved, report) = merge_documents(&[second, first]).unwrap();
    let document = Document::load_mem(&saved).unwrap();
    assert_eq!(document.get_pages().len(), 3);
    assert_eq!(report.page_count, 3);
    assert!(report.content_streams_preserved);
    let contents = document
        .get_pages()
        .into_values()
        .map(|page_id| document.get_page_content(page_id))
        .collect::<Vec<_>>();
    assert_eq!(
        contents,
        vec![b"three\n".to_vec(), b"one\n".to_vec(), b"two\n".to_vec()]
    );
}

#[test]
fn closing_releases_the_document_session() {
    let (mut store, id) = ready_store();
    assert_eq!(store.close(), DocumentState::empty());
    assert!(store.bytes(&id).is_err());
}

#[test]
fn serialized_state_matches_the_ui_contract() {
    let value = serde_json::to_value(DocumentState::empty()).unwrap();
    assert_eq!(value["phase"], "empty");
    assert_eq!(value["dirty"], false);
    assert_eq!(value["annotations"], serde_json::json!([]));
}
