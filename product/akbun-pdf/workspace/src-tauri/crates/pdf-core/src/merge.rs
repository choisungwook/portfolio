use lopdf::{dictionary, Document, Object, ObjectId};
use serde::Serialize;

use crate::edit::{load_pdf, materialize_inherited};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeReport {
    pub page_count: u32,
    pub saved_size: usize,
    pub content_streams_preserved: bool,
}

pub fn inspect_pdf(bytes: &[u8]) -> Result<u32, String> {
    Ok(load_pdf(bytes)?.get_pages().len() as u32)
}

pub fn merge_documents(inputs: &[Vec<u8>]) -> Result<(Vec<u8>, MergeReport), String> {
    if inputs.len() < 2 {
        return Err("합칠 PDF를 두 개 이상 추가해 주세요.".into());
    }

    let mut output = Document::with_version("1.7");
    let mut page_ids = Vec::new();
    let mut original_streams = Vec::new();
    let mut info_id = None;

    for bytes in inputs {
        let mut source = load_pdf(bytes)?;
        let source_pages = source.get_pages();
        for page_id in source_pages.values() {
            materialize_inherited(&mut source, *page_id)?;
        }
        original_streams.extend(stream_contents(&source));
        source.renumber_objects_with(output.max_id + 1);
        if info_id.is_none() {
            info_id = source
                .trailer
                .get(b"Info")
                .and_then(Object::as_reference)
                .ok();
        }
        page_ids.extend(source.get_pages().into_values());
        for (object_id, object) in source.objects {
            if !matches!(
                object.type_name(),
                Ok(b"Catalog" | b"Pages" | b"Outlines" | b"Outline")
            ) {
                output.objects.insert(object_id, object);
            }
        }
        output.max_id = output
            .objects
            .keys()
            .map(|(number, _)| *number)
            .max()
            .unwrap_or(output.max_id);
    }

    let pages_id = output.new_object_id();
    for page_id in &page_ids {
        output
            .get_object_mut(*page_id)
            .and_then(Object::as_dict_mut)
            .map_err(|error| error.to_string())?
            .set("Parent", pages_id);
    }
    output.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
            "Count" => page_ids.len() as i64,
        }),
    );
    let catalog_id = output.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    output.trailer.set("Root", catalog_id);
    if let Some(info) = info_id {
        output.trailer.set("Info", info);
    }

    let content_streams_preserved = original_streams == stream_contents(&output);
    let mut saved = Vec::new();
    output
        .save_to(&mut saved)
        .map_err(|error| error.to_string())?;
    let report = MergeReport {
        page_count: page_ids.len() as u32,
        saved_size: saved.len(),
        content_streams_preserved,
    };
    Ok((saved, report))
}

fn stream_contents(document: &Document) -> Vec<Vec<u8>> {
    let mut streams = document
        .objects
        .iter()
        .filter_map(|(id, object)| {
            object
                .as_stream()
                .ok()
                .map(|stream| (*id, stream.content.clone()))
        })
        .collect::<Vec<(ObjectId, Vec<u8>)>>();
    streams.sort_by_key(|(id, _)| *id);
    streams.into_iter().map(|(_, bytes)| bytes).collect()
}
