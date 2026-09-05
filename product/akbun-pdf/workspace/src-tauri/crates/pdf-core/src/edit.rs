use std::collections::{BTreeMap, HashSet};

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
        prune_outlines(&mut document, &ordered)?;
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

fn prune_outlines(document: &mut Document, pages: &[(u32, ObjectId)]) -> Result<(), String> {
    let outline_root = document
        .catalog()
        .ok()
        .and_then(|catalog| catalog.get(b"Outlines").ok())
        .and_then(|object| object.as_reference().ok());
    let Some(outline_root) = outline_root else {
        return Ok(());
    };
    let first = outline_reference(document, outline_root, b"First")?;
    let retained_pages = pages
        .iter()
        .map(|(_, page_id)| *page_id)
        .collect::<HashSet<_>>();
    let mut visited = HashSet::new();
    let (items, _) = prune_outline_level(
        document,
        outline_root,
        first,
        &retained_pages,
        &mut visited,
    )?;
    if items.is_empty() {
        document
            .catalog_mut()
            .map_err(|error| error.to_string())?
            .remove(b"Outlines");
    }
    Ok(())
}

fn prune_outline_level(
    document: &mut Document,
    parent: ObjectId,
    first: Option<ObjectId>,
    retained_pages: &HashSet<ObjectId>,
    visited: &mut HashSet<ObjectId>,
) -> Result<(Vec<ObjectId>, usize), String> {
    let mut current = first;
    let mut retained = Vec::new();
    let mut total = 0;
    while let Some(item_id) = current {
        if !visited.insert(item_id) {
            break;
        }
        let next = outline_reference(document, item_id, b"Next")?;
        let child = outline_reference(document, item_id, b"First")?;
        let destination = outline_destination_page(document, item_id)?;
        let (children, child_total) =
            prune_outline_level(document, item_id, child, retained_pages, visited)?;
        if destination.is_none_or(|page_id| retained_pages.contains(&page_id)) {
            retained.push(item_id);
            total += child_total + 1;
        } else {
            retained.extend(children);
            total += child_total;
        }
        current = next;
    }
    link_outline_level(document, parent, &retained, total)?;
    Ok((retained, total))
}

fn outline_reference(
    document: &Document,
    object_id: ObjectId,
    key: &[u8],
) -> Result<Option<ObjectId>, String> {
    let dictionary = document
        .get_object(object_id)
        .and_then(Object::as_dict)
        .map_err(|error| error.to_string())?;
    Ok(dictionary
        .get(key)
        .ok()
        .and_then(|object| object.as_reference().ok()))
}

fn outline_destination_page(
    document: &Document,
    item_id: ObjectId,
) -> Result<Option<ObjectId>, String> {
    let item = document
        .get_object(item_id)
        .and_then(Object::as_dict)
        .map_err(|error| error.to_string())?;
    if let Ok(destination) = item.get(b"Dest") {
        return Ok(destination_page(document, destination));
    }
    let Some(action) = item.get(b"A").ok().and_then(|object| dereference(document, object)) else {
        return Ok(None);
    };
    let destination = action
        .as_dict()
        .ok()
        .and_then(|dictionary| dictionary.get(b"D").ok());
    Ok(destination.and_then(|object| destination_page(document, object)))
}

fn destination_page(document: &Document, destination: &Object) -> Option<ObjectId> {
    let destination = dereference(document, destination)?;
    destination
        .as_array()
        .ok()?
        .first()?
        .as_reference()
        .ok()
}

fn dereference(document: &Document, object: &Object) -> Option<Object> {
    match object {
        Object::Reference(object_id) => document.get_object(*object_id).ok().cloned(),
        _ => Some(object.clone()),
    }
}

fn link_outline_level(
    document: &mut Document,
    parent: ObjectId,
    items: &[ObjectId],
    total: usize,
) -> Result<(), String> {
    let parent_dictionary = document
        .get_object_mut(parent)
        .and_then(Object::as_dict_mut)
        .map_err(|error| error.to_string())?;
    if items.is_empty() {
        parent_dictionary.remove(b"First");
        parent_dictionary.remove(b"Last");
        parent_dictionary.remove(b"Count");
        return Ok(());
    }
    parent_dictionary.set("First", items[0]);
    parent_dictionary.set("Last", items[items.len() - 1]);
    parent_dictionary.set("Count", total as i64);

    for (index, item_id) in items.iter().enumerate() {
        let dictionary = document
            .get_object_mut(*item_id)
            .and_then(Object::as_dict_mut)
            .map_err(|error| error.to_string())?;
        dictionary.set("Parent", parent);
        if let Some(previous) = index.checked_sub(1).and_then(|value| items.get(value)) {
            dictionary.set("Prev", *previous);
        } else {
            dictionary.remove(b"Prev");
        }
        if let Some(next) = items.get(index + 1) {
            dictionary.set("Next", *next);
        } else {
            dictionary.remove(b"Next");
        }
    }
    Ok(())
}

fn normalize_rotation(rotation: i32) -> i32 {
    rotation.rem_euclid(360)
}
