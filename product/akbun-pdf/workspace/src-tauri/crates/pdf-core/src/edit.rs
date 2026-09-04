use std::collections::BTreeMap;

use lopdf::{Document, IncrementalDocument, Object, ObjectId};

use crate::annotations::replace_annotations;
use crate::{Annotation, Thumbnail};

const INHERITED_PAGE_KEYS: [&[u8]; 4] = [b"Resources", b"MediaBox", b"CropBox", b"Rotate"];

pub(crate) fn render_document(
    bytes: &[u8],
    pages: &[Thumbnail],
    annotations: &[Annotation],
) -> Result<(Vec<u8>, bool), String> {
    let original = load_pdf(bytes)?;
    let mut document = original.clone();
    let original_pages = document.get_pages();
    let root_id = document
        .catalog()
        .and_then(|catalog| catalog.get(b"Pages"))
        .and_then(Object::as_reference)
        .map_err(|error| error.to_string())?;

    let mut ordered = Vec::with_capacity(pages.len());
    for page in pages {
        let page_id = *original_pages
            .get(&page.source_page)
            .ok_or_else(|| format!("{}페이지를 찾을 수 없습니다.", page.source_page))?;
        materialize_inherited(&mut document, page_id)?;
        let page_dict = document
            .get_object_mut(page_id)
            .and_then(Object::as_dict_mut)
            .map_err(|error| error.to_string())?;
        let base_rotation = page_dict
            .get(b"Rotate")
            .and_then(Object::as_i64)
            .unwrap_or(0) as i32;
        page_dict.set("Rotate", normalize_rotation(base_rotation + page.rotation));
        page_dict.set("Parent", root_id);
        ordered.push((page.source_page, page_id));
    }
    let original_streams = page_streams_for_ids(&document, &ordered);

    let page_root = document
        .get_object_mut(root_id)
        .and_then(Object::as_dict_mut)
        .map_err(|error| error.to_string())?;
    page_root.set(
        "Kids",
        ordered
            .iter()
            .map(|(_, object_id)| Object::Reference(*object_id))
            .collect::<Vec<_>>(),
    );
    page_root.set("Count", ordered.len() as i64);

    if ordered.len() != original_pages.len() {
        document
            .catalog_mut()
            .map_err(|error| error.to_string())?
            .remove(b"Outlines");
    }
    replace_annotations(&mut document, &ordered, annotations)?;
    let streams_preserved = original_streams == page_streams_for_ids(&document, &ordered);
    let mut incremental = IncrementalDocument::create_from(bytes.to_vec(), original.clone());
    for (object_id, object) in document.objects {
        if original.objects.get(&object_id) != Some(&object) {
            incremental.new_document.set_object(object_id, object);
        }
    }
    incremental.new_document.max_id = document.max_id;
    let mut saved = Vec::new();
    incremental
        .save_to(&mut saved)
        .map_err(|error| error.to_string())?;
    Ok((saved, streams_preserved))
}

pub(crate) fn load_pdf(bytes: &[u8]) -> Result<Document, String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err("PDF 파일 형식이 아닙니다.".into());
    }
    let document =
        Document::load_mem(bytes).map_err(|error| format!("PDF를 읽을 수 없습니다: {error}"))?;
    if document.is_encrypted() {
        return Err("암호로 보호된 PDF는 지원하지 않습니다.".into());
    }
    if document.get_pages().is_empty() {
        return Err("페이지가 없는 PDF입니다.".into());
    }
    Ok(document)
}

pub(crate) fn materialize_inherited(
    document: &mut Document,
    page_id: ObjectId,
) -> Result<(), String> {
    let values = inherited_values(document, page_id);
    let page = document
        .get_object_mut(page_id)
        .and_then(Object::as_dict_mut)
        .map_err(|error| error.to_string())?;
    for (key, value) in values {
        if !page.has(&key) {
            page.set(key, value);
        }
    }
    Ok(())
}

fn inherited_values(document: &Document, page_id: ObjectId) -> BTreeMap<Vec<u8>, Object> {
    let mut values = BTreeMap::new();
    let mut current = Some(page_id);
    while let Some(object_id) = current {
        let Ok(dict) = document.get_object(object_id).and_then(Object::as_dict) else {
            break;
        };
        for key in INHERITED_PAGE_KEYS {
            if !values.contains_key(key) {
                if let Ok(value) = dict.get(key) {
                    values.insert(key.to_vec(), value.clone());
                }
            }
        }
        current = dict.get(b"Parent").and_then(Object::as_reference).ok();
    }
    values
}

fn page_streams_for_ids(document: &Document, pages: &[(u32, ObjectId)]) -> Vec<Vec<u8>> {
    pages
        .iter()
        .flat_map(|(_, page_id)| document.get_page_contents(*page_id))
        .filter_map(|stream_id| document.get_object(stream_id).ok()?.as_stream().ok())
        .map(|stream| stream.content.clone())
        .collect()
}

fn normalize_rotation(rotation: i32) -> i32 {
    rotation.rem_euclid(360)
}
