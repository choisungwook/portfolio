//! Speaker notes: one notes page per slide that has notes, plus the notes
//! master PowerPoint requires before it shows any of them.
//!
//! Only the body placeholder's text survives a round trip. The notes page
//! layout, its slide thumbnail and any formatting are PowerPoint's to draw.

use super::common::{xml_escape, NS};
use quick_xml::events::Event;
use quick_xml::Reader;

const REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

pub(super) const MASTER_PATH: &str = "ppt/notesMasters/notesMaster1.xml";
pub(super) const MASTER_RELS_PATH: &str = "ppt/notesMasters/_rels/notesMaster1.xml.rels";
/// The notes master gets its own theme part, the layout PowerPoint itself
/// writes, rather than pointing at the slide master's theme.
pub(super) const THEME_PATH: &str = "ppt/theme/theme2.xml";

pub(super) fn content_type_overrides(slides_with_notes: &[usize]) -> String {
    if slides_with_notes.is_empty() {
        return String::new();
    }
    let mut out = String::from(
        "<Override PartName=\"/ppt/notesMasters/notesMaster1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml\"/>\
<Override PartName=\"/ppt/theme/theme2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.theme+xml\"/>",
    );
    for n in slides_with_notes {
        out.push_str(&format!(
            "<Override PartName=\"/ppt/notesSlides/notesSlide{n}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml\"/>"
        ));
    }
    out
}

pub(super) fn master_id_list(rid: &str) -> String {
    format!("<p:notesMasterIdLst><p:notesMasterId r:id=\"{rid}\"/></p:notesMasterIdLst>")
}

pub(super) fn master_relationship(rid: &str) -> String {
    format!("<Relationship Id=\"{rid}\" Type=\"{REL}/notesMaster\" Target=\"notesMasters/notesMaster1.xml\"/>")
}

pub(super) fn slide_relationship(n: usize) -> String {
    format!("<Relationship Id=\"rIdNotes\" Type=\"{REL}/notesSlide\" Target=\"../notesSlides/notesSlide{n}.xml\"/>")
}

pub(super) fn master_xml() -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<p:notesMaster{NS}><p:cSld><p:spTree>{TREE_HEADER}</p:spTree></p:cSld>\
<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>\
</p:notesMaster>"
    )
}

pub(super) fn master_rels() -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"{REL}/theme\" Target=\"../theme/theme2.xml\"/></Relationships>"
    )
}

pub(super) fn notes_slide_xml(notes: &str) -> String {
    let paragraphs: String = notes
        .split('\n')
        .map(|line| {
            if line.is_empty() {
                "<a:p/>".to_string()
            } else {
                format!("<a:p><a:r><a:t>{}</a:t></a:r></a:p>", xml_escape(line))
            }
        })
        .collect();
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<p:notes{NS}><p:cSld><p:spTree>{TREE_HEADER}\
<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Slide Image Placeholder 1\"/><p:cNvSpPr><a:spLocks noGrp=\"1\" noRot=\"1\" noChangeAspect=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldImg\"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>\
<p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Notes Placeholder 2\"/><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr/>\
<p:txBody><a:bodyPr/><a:lstStyle/>{paragraphs}</p:txBody></p:sp>\
</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>"
    )
}

pub(super) fn notes_slide_rels(n: usize) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"{REL}/notesMaster\" Target=\"../notesMasters/notesMaster1.xml\"/>\
<Relationship Id=\"rId2\" Type=\"{REL}/slide\" Target=\"../slides/slide{n}.xml\"/></Relationships>"
    )
}

const TREE_HEADER: &str = "<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\
<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>";

/// The text of a notes page's body placeholder, one line per paragraph.
/// Other shapes on the page (slide image, header, page number) are ignored.
pub(super) fn parse_notes(xml: &str) -> String {
    let mut reader = Reader::from_str(xml);
    let mut lines: Vec<String> = Vec::new();
    let mut shape: Vec<String> = Vec::new();
    let mut is_body = false;
    let mut in_text = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => match e.local_name().as_ref() {
                b"sp" => {
                    shape.clear();
                    is_body = false;
                }
                b"p" => shape.push(String::new()),
                b"t" => in_text = true,
                _ => {}
            },
            Ok(Event::Empty(ref e)) => match e.local_name().as_ref() {
                b"ph" => {
                    is_body = e.attributes().flatten().any(|a| {
                        a.key.local_name().as_ref() == b"type" && a.value.as_ref() == b"body"
                    })
                }
                b"p" => shape.push(String::new()),
                b"br" => {
                    if let Some(line) = shape.last_mut() {
                        line.push('\n');
                    }
                }
                _ => {}
            },
            Ok(Event::Text(ref t)) if in_text => {
                if let (Some(line), Ok(text)) = (shape.last_mut(), t.decode()) {
                    line.push_str(&text);
                }
            }
            Ok(Event::GeneralRef(ref e)) if in_text => {
                let ch = match e.as_ref() {
                    b"lt" => Some('<'),
                    b"gt" => Some('>'),
                    b"amp" => Some('&'),
                    b"quot" => Some('"'),
                    b"apos" => Some('\''),
                    _ => e.resolve_char_ref().ok().flatten(),
                };
                if let (Some(line), Some(ch)) = (shape.last_mut(), ch) {
                    line.push(ch);
                }
            }
            Ok(Event::End(ref e)) => match e.local_name().as_ref() {
                b"t" => in_text = false,
                b"sp" if is_body => lines.append(&mut shape),
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    lines.join("\n").trim_end().to_string()
}
