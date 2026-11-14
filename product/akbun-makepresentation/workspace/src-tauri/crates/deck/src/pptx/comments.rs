//! Shape comments, written as legacy presentation comments so other tools
//! show them: one author part for the package plus one comments part per slide
//! that has any. The model has no author, so the single author is a fixed
//! neutral one and no identity or clock reading is ever embedded.

use super::common::{xml_escape, NS};
use crate::Shape;
use quick_xml::events::Event;
use quick_xml::Reader;

const REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

pub(super) const AUTHORS_PATH: &str = "ppt/commentAuthors.xml";

/// A constant on purpose: embedding the save time would make every save of an
/// unchanged deck differ and would leak when the user worked.
const FIXED_DT: &str = "2000-01-01T00:00:00.000";

/// The legacy format positions a comment in 1/576 inch ("master units"). This
/// crate maps 96 px to one inch (9525 EMU per px, 914400 EMU per inch), so one
/// pixel is 576 / 96 = 6 comment units.
const UNITS_PER_PX: f64 = 6.0;

/// How far a comment may sit from a shape's top-left corner and still belong to
/// it: two pixels, which covers unit rounding and the pen's re-fitted bounds.
const TOLERANCE_UNITS: i64 = 12;

pub(super) fn has_comment(shape: &Shape) -> bool {
    !shape.comment.trim().is_empty()
}

pub(super) fn content_type_overrides(slides_with_comments: &[usize]) -> String {
    if slides_with_comments.is_empty() {
        return String::new();
    }
    let mut out = String::from(
        "<Override PartName=\"/ppt/commentAuthors.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml\"/>",
    );
    for n in slides_with_comments {
        out.push_str(&format!(
            "<Override PartName=\"/ppt/comments/comment{n}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.comments+xml\"/>"
        ));
    }
    out
}

pub(super) fn authors_relationship(rid: &str) -> String {
    format!("<Relationship Id=\"{rid}\" Type=\"{REL}/commentAuthors\" Target=\"commentAuthors.xml\"/>")
}

pub(super) fn slide_relationship(n: usize) -> String {
    format!("<Relationship Id=\"rIdComments\" Type=\"{REL}/comments\" Target=\"../comments/comment{n}.xml\"/>")
}

pub(super) fn authors_xml(total: usize) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<p:cmAuthorLst{NS}><p:cmAuthor id=\"0\" name=\"Comment\" initials=\"C\" lastIdx=\"{total}\" clrIdx=\"0\"/></p:cmAuthorLst>"
    )
}

/// The comments part for one slide. `first_idx` is the number of comments
/// written to earlier slides, so every idx is unique for the one author.
pub(super) fn comments_xml(shapes: &[Shape], first_idx: usize) -> String {
    let mut list = String::new();
    for (offset, shape) in shapes.iter().filter(|s| has_comment(s)).enumerate() {
        let (x, y) = origin(shape);
        list.push_str(&format!(
            "<p:cm authorId=\"0\" dt=\"{FIXED_DT}\" idx=\"{}\"><p:pos x=\"{}\" y=\"{}\"/><p:text>{}</p:text></p:cm>",
            first_idx + offset + 1,
            (x * UNITS_PER_PX).round() as i64,
            (y * UNITS_PER_PX).round() as i64,
            xml_escape(shape.comment.trim())
        ));
    }
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:cmLst{NS}>{list}</p:cmLst>")
}

/// The top-left of the box a shape occupies, which is where a comment marker
/// is anchored. Lines may have negative w/h and the pen keeps absolute points.
fn bounds(shape: &Shape) -> (f64, f64, f64, f64) {
    if shape.kind == "pen" && !shape.points.is_empty() {
        let xs = shape.points.iter().map(|p| p[0]);
        let ys = shape.points.iter().map(|p| p[1]);
        let (x0, x1) = xs.fold((f64::MAX, f64::MIN), |(lo, hi), v| (lo.min(v), hi.max(v)));
        let (y0, y1) = ys.fold((f64::MAX, f64::MIN), |(lo, hi), v| (lo.min(v), hi.max(v)));
        return (x0, y0, x1, y1);
    }
    (
        shape.x.min(shape.x + shape.w),
        shape.y.min(shape.y + shape.h),
        shape.x.max(shape.x + shape.w),
        shape.y.max(shape.y + shape.h),
    )
}

fn origin(shape: &Shape) -> (f64, f64) {
    let (x, y, _, _) = bounds(shape);
    (x, y)
}

/// Comments in a slide's comments part as (x, y, text), in file order. A part
/// that does not parse yields nothing: opening a deck must never fail because
/// of a comment.
pub(super) fn parse_comments(xml: &str) -> Vec<(i64, i64, String)> {
    let mut reader = Reader::from_str(xml);
    let mut out = Vec::new();
    let mut pos = (0, 0);
    let mut text = String::new();
    let mut in_text = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => match e.local_name().as_ref() {
                b"cm" => {
                    pos = (0, 0);
                    text.clear();
                }
                b"pos" => pos = read_pos(e),
                b"text" => in_text = true,
                _ => {}
            },
            Ok(Event::Empty(ref e)) if e.local_name().as_ref() == b"pos" => pos = read_pos(e),
            Ok(Event::Text(ref t)) if in_text => match t.decode() {
                Ok(s) => text.push_str(&s),
                Err(_) => return Vec::new(),
            },
            Ok(Event::GeneralRef(ref e)) if in_text => {
                let ch = match e.as_ref() {
                    b"lt" => Some('<'),
                    b"gt" => Some('>'),
                    b"amp" => Some('&'),
                    b"quot" => Some('"'),
                    b"apos" => Some('\''),
                    _ => e.resolve_char_ref().ok().flatten(),
                };
                if let Some(ch) = ch {
                    text.push(ch);
                }
            }
            Ok(Event::End(ref e)) => match e.local_name().as_ref() {
                b"text" => in_text = false,
                b"cm" if !text.trim().is_empty() => out.push((pos.0, pos.1, text.trim().to_string())),
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(_) => return Vec::new(),
            _ => {}
        }
    }
    out
}

fn read_pos(e: &quick_xml::events::BytesStart) -> (i64, i64) {
    let get = |name: &[u8]| {
        e.attributes()
            .flatten()
            .find(|a| a.key.local_name().as_ref() == name)
            .and_then(|a| String::from_utf8_lossy(a.value.as_ref()).parse().ok())
            .unwrap_or(0)
    };
    (get(b"x"), get(b"y"))
}

/// Put each comment back on the shape it was written for.
///
/// ponytail: position-based matching. Ceiling: the legacy format has no shape
/// id, so two shapes sharing one top-left corner are told apart only by order,
/// and when just the later one carried a comment it comes back on the earlier
/// one. Upgrade path: modern threaded comments, which name the shape id.
pub(super) fn attach(shapes: &mut [Shape], comments: Vec<(i64, i64, String)>) {
    for (x, y, text) in comments {
        let near = |s: &Shape| {
            let (ox, oy) = origin(s);
            ((ox * UNITS_PER_PX).round() as i64 - x).abs() <= TOLERANCE_UNITS
                && ((oy * UNITS_PER_PX).round() as i64 - y).abs() <= TOLERANCE_UNITS
        };
        // Written in shape order, so the k-th comment at one corner is the
        // k-th shape there: take the first free shape at the corner.
        let target = shapes
            .iter()
            .position(|s| s.comment.is_empty() && near(s))
            // A comment from another producer sits wherever its author put it:
            // the topmost (last drawn) free shape that contains the point.
            .or_else(|| {
                let (px, py) = (x as f64 / UNITS_PER_PX, y as f64 / UNITS_PER_PX);
                shapes.iter().rposition(|s| {
                    let (x0, y0, x1, y1) = bounds(s);
                    s.comment.is_empty() && px >= x0 && px <= x1 && py >= y0 && py <= y1
                })
            });
        if let Some(i) = target {
            shapes[i].comment = text;
        }
    }
}
