use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};

use crate::{Annotation, AnnotationKind, PdfRect};

pub(crate) fn read_annotations(document: &Document) -> Vec<Annotation> {
    document
        .get_pages()
        .into_iter()
        .flat_map(|(page, page_id)| read_page_annotations(document, page, page_id))
        .collect()
}

pub(crate) fn replace_annotations(
    document: &mut Document,
    page_ids: &[(u32, ObjectId)],
    annotations: &[Annotation],
) -> Result<(), String> {
    for (source_page, page_id) in page_ids {
        let kept = unsupported_annotations(document, *page_id);
        let mut items = kept;
        for annotation in annotations
            .iter()
            .filter(|item| item.source_page == *source_page)
        {
            let object_id = add_annotation_object(document, annotation)?;
            items.push(Object::Reference(object_id));
        }
        let page = document
            .get_object_mut(*page_id)
            .and_then(Object::as_dict_mut)
            .map_err(|error| error.to_string())?;
        if items.is_empty() {
            page.remove(b"Annots");
        } else {
            page.set("Annots", items);
        }
    }
    Ok(())
}

fn read_page_annotations(document: &Document, page: u32, page_id: ObjectId) -> Vec<Annotation> {
    let Ok(page_dict) = document.get_object(page_id).and_then(Object::as_dict) else {
        return Vec::new();
    };
    let Ok(items) = resolved_array(document, page_dict.get(b"Annots")) else {
        return Vec::new();
    };
    items
        .iter()
        .enumerate()
        .filter_map(|(index, object)| {
            let (object_id, dict) = resolved_dict(document, object)?;
            annotation_from_dict(page, index, object_id, dict)
        })
        .collect()
}

fn annotation_from_dict(
    page: u32,
    index: usize,
    object_id: Option<ObjectId>,
    dict: &Dictionary,
) -> Option<Annotation> {
    let kind = match dict.get(b"Subtype").and_then(Object::as_name).ok()? {
        b"Highlight" => AnnotationKind::Highlight,
        b"Text" => AnnotationKind::Note,
        _ => return None,
    };
    let rect = rect_from_object(dict.get(b"Rect").ok()?)?;
    let id = dict
        .get(b"NM")
        .and_then(Object::as_str)
        .ok()
        .map(decode_pdf_text)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| match object_id {
            Some((number, generation)) => format!("pdf-{number}-{generation}"),
            None => format!("pdf-{page}-{index}"),
        });
    Some(Annotation {
        id,
        page,
        kind,
        rect,
        color: color_from_dict(dict),
        contents: dict
            .get(b"Contents")
            .and_then(Object::as_str)
            .ok()
            .map(decode_pdf_text)
            .unwrap_or_default(),
        source_page: page,
    })
}

fn unsupported_annotations(document: &Document, page_id: ObjectId) -> Vec<Object> {
    let Ok(page) = document.get_object(page_id).and_then(Object::as_dict) else {
        return Vec::new();
    };
    let Ok(items) = resolved_array(document, page.get(b"Annots")) else {
        return Vec::new();
    };
    items
        .iter()
        .filter(|object| {
            let Some((_, dict)) = resolved_dict(document, object) else {
                return true;
            };
            !matches!(
                dict.get(b"Subtype").and_then(Object::as_name),
                Ok(b"Highlight" | b"Text")
            )
        })
        .cloned()
        .collect()
}

fn add_annotation_object(
    document: &mut Document,
    annotation: &Annotation,
) -> Result<ObjectId, String> {
    let rect = normalized_rect(&annotation.rect);
    let color = parse_color(&annotation.color);
    let width = (rect.x2 - rect.x1).max(1.0);
    let height = (rect.y2 - rect.y1).max(1.0);
    let appearance = appearance_stream(document, &annotation.kind, color, width, height);
    let mut dict = dictionary! {
        "Type" => "Annot",
        "Rect" => vec![rect.x1.into(), rect.y1.into(), rect.x2.into(), rect.y2.into()],
        "C" => color.into_iter().map(Object::Real).collect::<Vec<_>>(),
        "F" => 4,
        "NM" => pdf_text(&annotation.id),
        "Contents" => pdf_text(&annotation.contents),
        "AP" => dictionary! { "N" => appearance },
    };
    match annotation.kind {
        AnnotationKind::Highlight => {
            dict.set("Subtype", "Highlight");
            dict.set("CA", 0.35_f32);
            dict.set(
                "QuadPoints",
                vec![
                    rect.x1.into(),
                    rect.y2.into(),
                    rect.x2.into(),
                    rect.y2.into(),
                    rect.x1.into(),
                    rect.y1.into(),
                    rect.x2.into(),
                    rect.y1.into(),
                ],
            );
        }
        AnnotationKind::Note => {
            dict.set("Subtype", "Text");
            dict.set("Name", "Comment");
            dict.set("Open", false);
        }
    }
    Ok(document.add_object(dict))
}

fn appearance_stream(
    document: &mut Document,
    kind: &AnnotationKind,
    color: [f32; 3],
    width: f32,
    height: f32,
) -> ObjectId {
    let [red, green, blue] = color;
    let content = match kind {
        AnnotationKind::Highlight => format!(
            "q /GS1 gs {red} {green} {blue} rg 0 0 {width} {height} re f Q"
        ),
        AnnotationKind::Note => format!(
            "q {red} {green} {blue} rg 1 1 {width} {height} re f 0 0 0 RG 1 w 1 1 {width} {height} re S Q"
        ),
    };
    let resources = if matches!(kind, AnnotationKind::Highlight) {
        dictionary! {
            "ExtGState" => dictionary! {
                "GS1" => dictionary! { "Type" => "ExtGState", "ca" => 0.35_f32, "BM" => "Multiply" }
            }
        }
    } else {
        Dictionary::new()
    };
    document.add_object(Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Form",
            "BBox" => vec![0.into(), 0.into(), width.into(), height.into()],
            "Resources" => resources,
        },
        content.into_bytes(),
    ))
}

fn resolved_array<'a>(
    document: &'a Document,
    object: lopdf::Result<&'a Object>,
) -> lopdf::Result<&'a Vec<Object>> {
    let object = object?;
    match object {
        Object::Reference(id) => document.get_object(*id)?.as_array(),
        _ => object.as_array(),
    }
}

fn resolved_dict<'a>(
    document: &'a Document,
    object: &'a Object,
) -> Option<(Option<ObjectId>, &'a Dictionary)> {
    match object {
        Object::Reference(id) => document
            .get_object(*id)
            .ok()?
            .as_dict()
            .ok()
            .map(|dict| (Some(*id), dict)),
        Object::Dictionary(dict) => Some((None, dict)),
        _ => None,
    }
}

fn rect_from_object(object: &Object) -> Option<PdfRect> {
    let values = object.as_array().ok()?;
    if values.len() < 4 {
        return None;
    }
    Some(normalized_rect(&PdfRect {
        x1: values[0].as_float().ok()?,
        y1: values[1].as_float().ok()?,
        x2: values[2].as_float().ok()?,
        y2: values[3].as_float().ok()?,
    }))
}

fn normalized_rect(rect: &PdfRect) -> PdfRect {
    PdfRect {
        x1: rect.x1.min(rect.x2),
        y1: rect.y1.min(rect.y2),
        x2: rect.x1.max(rect.x2),
        y2: rect.y1.max(rect.y2),
    }
}

fn parse_color(color: &str) -> [f32; 3] {
    let value = color.strip_prefix('#').unwrap_or(color);
    if value.len() != 6 {
        return [1.0, 0.84, 0.2];
    }
    let channel =
        |offset| u8::from_str_radix(&value[offset..offset + 2], 16).unwrap_or(0) as f32 / 255.0;
    [channel(0), channel(2), channel(4)]
}

fn color_from_dict(dict: &Dictionary) -> String {
    let values: Option<&Vec<Object>> = dict.get(b"C").and_then(Object::as_array).ok();
    let channel = |index: usize| -> f32 {
        values
            .and_then(|items| items.get(index))
            .and_then(|item| item.as_float().ok())
            .unwrap_or(if index < 2 { 1.0_f32 } else { 0.2_f32 })
            .clamp(0.0_f32, 1.0_f32)
    };
    format!(
        "#{:02x}{:02x}{:02x}",
        (channel(0) * 255.0).round() as u8,
        (channel(1) * 255.0).round() as u8,
        (channel(2) * 255.0).round() as u8,
    )
}

fn pdf_text(value: &str) -> Object {
    let mut bytes = vec![0xfe, 0xff];
    bytes.extend(value.encode_utf16().flat_map(u16::to_be_bytes));
    Object::String(bytes, StringFormat::Hexadecimal)
}

fn decode_pdf_text(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xfe, 0xff]) {
        let words = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]));
        return String::from_utf16_lossy(&words.collect::<Vec<_>>());
    }
    String::from_utf8_lossy(bytes).into_owned()
}
