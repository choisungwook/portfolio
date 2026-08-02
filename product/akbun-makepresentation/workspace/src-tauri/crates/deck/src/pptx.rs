//! Read and write .pptx files.
//!
//! A .pptx is a zip of XML parts. Writing builds each part from string
//! templates: the presentation, one master, one blank layout, one theme, and
//! one part per slide. Reading walks each slide part with a pull parser and
//! keeps only what this editor understands: preset rects, ellipses and lines,
//! freehand paths, and text boxes. Groups, pictures, tables and theme-colored
//! styling from other editors are skipped rather than guessed at.

use crate::{Deck, Shape, Slide, EMU_PER_PX};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::{Read, Seek, Write};

const NS: &str = concat!(
    " xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"",
    " xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"",
    " xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\""
);

fn emu(px: f64) -> i64 {
    (px * EMU_PER_PX).round() as i64
}

fn px(emu: i64) -> f64 {
    (emu as f64 / EMU_PER_PX * 100.0).round() / 100.0
}

/// "#rrggbb" -> "RRGGBB". Anything unparseable becomes gray instead of
/// invalid XML.
fn hex(color: &str) -> String {
    let c = color.trim_start_matches('#');
    if c.len() == 6 && c.chars().all(|ch| ch.is_ascii_hexdigit()) {
        c.to_ascii_uppercase()
    } else {
        "808080".into()
    }
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

pub fn write<W: Write + Seek>(deck: &Deck, out: W) -> Result<(), String> {
    let mut zip = zip::ZipWriter::new(out);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let mut add = |name: &str, body: String| -> Result<(), String> {
        zip.start_file(name, opts).map_err(|e| e.to_string())?;
        zip.write_all(body.as_bytes()).map_err(|e| e.to_string())
    };

    let n = deck.slides.len().max(1);
    add("[Content_Types].xml", content_types(n))?;
    add("_rels/.rels", ROOT_RELS.into())?;
    add("ppt/presentation.xml", presentation(n))?;
    add("ppt/_rels/presentation.xml.rels", presentation_rels(n))?;
    add("ppt/slideMasters/slideMaster1.xml", MASTER.into())?;
    add("ppt/slideMasters/_rels/slideMaster1.xml.rels", MASTER_RELS.into())?;
    add("ppt/slideLayouts/slideLayout1.xml", LAYOUT.into())?;
    add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", LAYOUT_RELS.into())?;
    add("ppt/theme/theme1.xml", THEME.into())?;

    let empty = Slide::default();
    for i in 0..n {
        let slide = deck.slides.get(i).unwrap_or(&empty);
        add(&format!("ppt/slides/slide{}.xml", i + 1), slide_xml(slide))?;
        add(
            &format!("ppt/slides/_rels/slide{}.xml.rels", i + 1),
            SLIDE_RELS.into(),
        )?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn content_types(slides: usize) -> String {
    let mut overrides = String::new();
    for i in 1..=slides {
        overrides.push_str(&format!(
            "<Override PartName=\"/ppt/slides/slide{i}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>"
        ));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\
<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\
<Default Extension=\"xml\" ContentType=\"application/xml\"/>\
<Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/>\
<Override PartName=\"/ppt/slideMasters/slideMaster1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml\"/>\
<Override PartName=\"/ppt/slideLayouts/slideLayout1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml\"/>\
<Override PartName=\"/ppt/theme/theme1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.theme+xml\"/>\
{overrides}</Types>"
    )
}

const ROOT_RELS: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"ppt/presentation.xml\"/>\
</Relationships>";

fn presentation(slides: usize) -> String {
    let mut ids = String::new();
    for i in 0..slides {
        ids.push_str(&format!(
            "<p:sldId id=\"{}\" r:id=\"rId{}\"/>",
            256 + i,
            i + 2
        ));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<p:presentation{NS}>\
<p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rId1\"/></p:sldMasterIdLst>\
<p:sldIdLst>{ids}</p:sldIdLst>\
<p:sldSz cx=\"12192000\" cy=\"6858000\"/>\
<p:notesSz cx=\"6858000\" cy=\"9144000\"/>\
</p:presentation>"
    )
}

fn presentation_rels(slides: usize) -> String {
    let mut rels = String::from(
        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"slideMasters/slideMaster1.xml\"/>",
    );
    for i in 0..slides {
        rels.push_str(&format!(
            "<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide{}.xml\"/>",
            i + 2,
            i + 1
        ));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">{rels}</Relationships>"
    )
}

const EMPTY_TREE_HEADER: &str = "<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\
<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>";

const MASTER: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<p:sldMaster xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\
<p:cSld><p:bg><p:bgRef idx=\"1001\"><a:schemeClr val=\"bg1\"/></p:bgRef></p:bg>\
<p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\
<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>\
<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>\
<p:sldLayoutIdLst><p:sldLayoutId id=\"2147483649\" r:id=\"rId1\"/></p:sldLayoutIdLst>\
</p:sldMaster>";

const MASTER_RELS: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme\" Target=\"../theme/theme1.xml\"/>\
</Relationships>";

const LAYOUT: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"blank\" preserve=\"1\">\
<p:cSld name=\"Blank\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\
<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>\
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\
</p:sldLayout>";

const LAYOUT_RELS: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"../slideMasters/slideMaster1.xml\"/>\
</Relationships>";

const SLIDE_RELS: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>\
</Relationships>";

// The smallest theme readers accept: a color scheme, a font scheme, and a
// format scheme with three entries each. Nothing in it is ever shown because
// every shape carries explicit colors.
const THEME: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" name=\"Office\">\
<a:themeElements>\
<a:clrScheme name=\"Office\">\
<a:dk1><a:sysClr val=\"windowText\" lastClr=\"000000\"/></a:dk1>\
<a:lt1><a:sysClr val=\"window\" lastClr=\"FFFFFF\"/></a:lt1>\
<a:dk2><a:srgbClr val=\"44546A\"/></a:dk2>\
<a:lt2><a:srgbClr val=\"E7E6E6\"/></a:lt2>\
<a:accent1><a:srgbClr val=\"4472C4\"/></a:accent1>\
<a:accent2><a:srgbClr val=\"ED7D31\"/></a:accent2>\
<a:accent3><a:srgbClr val=\"A5A5A5\"/></a:accent3>\
<a:accent4><a:srgbClr val=\"FFC000\"/></a:accent4>\
<a:accent5><a:srgbClr val=\"5B9BD5\"/></a:accent5>\
<a:accent6><a:srgbClr val=\"70AD47\"/></a:accent6>\
<a:hlink><a:srgbClr val=\"0563C1\"/></a:hlink>\
<a:folHlink><a:srgbClr val=\"954F72\"/></a:folHlink>\
</a:clrScheme>\
<a:fontScheme name=\"Office\">\
<a:majorFont><a:latin typeface=\"Calibri Light\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:majorFont>\
<a:minorFont><a:latin typeface=\"Calibri\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:minorFont>\
</a:fontScheme>\
<a:fmtScheme name=\"Office\">\
<a:fillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:fillStyleLst>\
<a:lnStyleLst><a:ln w=\"6350\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln><a:ln w=\"12700\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln><a:ln w=\"19050\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln></a:lnStyleLst>\
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>\
<a:bgFillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:bgFillStyleLst>\
</a:fmtScheme>\
</a:themeElements>\
</a:theme>";

fn slide_xml(slide: &Slide) -> String {
    let mut shapes = String::new();
    for (i, shape) in slide.shapes.iter().enumerate() {
        // ids 1 (tree) is taken; shape ids start at 2.
        shapes.push_str(&shape_xml(shape, i as u64 + 2));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<p:sld{NS}><p:cSld><p:spTree>{EMPTY_TREE_HEADER}{shapes}</p:spTree></p:cSld>\
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
    )
}

fn line_xml(shape: &Shape, arrow: bool) -> String {
    let w = emu(shape.stroke_width).max(1);
    let dash = match shape.dash.as_str() {
        "dash" => "<a:prstDash val=\"dash\"/>",
        "dot" => "<a:prstDash val=\"sysDot\"/>",
        _ => "",
    };
    let head = if arrow {
        "<a:tailEnd type=\"triangle\"/>"
    } else {
        ""
    };
    format!(
        "<a:ln w=\"{w}\"><a:solidFill><a:srgbClr val=\"{}\"/></a:solidFill>{dash}{head}</a:ln>",
        hex(&shape.stroke)
    )
}

fn fill_xml(fill: &str) -> String {
    if fill == "none" {
        "<a:noFill/>".into()
    } else {
        format!("<a:solidFill><a:srgbClr val=\"{}\"/></a:solidFill>", hex(fill))
    }
}

fn xfrm(x: f64, y: f64, w: f64, h: f64, flip_h: bool, flip_v: bool) -> String {
    let flips = format!(
        "{}{}",
        if flip_h { " flipH=\"1\"" } else { "" },
        if flip_v { " flipV=\"1\"" } else { "" }
    );
    format!(
        "<a:xfrm{flips}><a:off x=\"{}\" y=\"{}\"/><a:ext cx=\"{}\" cy=\"{}\"/></a:xfrm>",
        emu(x),
        emu(y),
        emu(w).max(1),
        emu(h).max(1)
    )
}

fn text_body(shape: &Shape) -> String {
    let size = ((shape.font_size * 100.0 / 1.3333).round() as i64).max(100);
    let color = hex(&shape.text_color);
    let mut paragraphs = String::new();
    for line in shape.text.split('\n') {
        paragraphs.push_str(&format!(
            "<a:p><a:r><a:rPr lang=\"en-US\" sz=\"{size}\" dirty=\"0\"><a:solidFill><a:srgbClr val=\"{color}\"/></a:solidFill></a:rPr><a:t>{}</a:t></a:r></a:p>",
            xml_escape(line)
        ));
    }
    format!(
        "<p:txBody><a:bodyPr wrap=\"square\" lIns=\"0\" tIns=\"0\" rIns=\"0\" bIns=\"0\"><a:noAutofit/></a:bodyPr><a:lstStyle/>{paragraphs}</p:txBody>"
    )
}

fn shape_xml(shape: &Shape, id: u64) -> String {
    match shape.kind.as_str() {
        "line" | "arrow" => {
            let arrow = shape.kind == "arrow";
            let (x, w) = if shape.w < 0.0 {
                (shape.x + shape.w, -shape.w)
            } else {
                (shape.x, shape.w)
            };
            let (y, h) = if shape.h < 0.0 {
                (shape.y + shape.h, -shape.h)
            } else {
                (shape.y, shape.h)
            };
            format!(
                "<p:cxnSp><p:nvCxnSpPr><p:cNvPr id=\"{id}\" name=\"Line {id}\"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>\
<p:spPr>{}<a:prstGeom prst=\"line\"><a:avLst/></a:prstGeom>{}</p:spPr></p:cxnSp>",
                xfrm(x, y, w, h, shape.w < 0.0, shape.h < 0.0),
                line_xml(shape, arrow)
            )
        }
        "pen" => {
            let (bx, by, bw, bh) = pen_bbox(&shape.points);
            let path_w = emu(bw).max(1);
            let path_h = emu(bh).max(1);
            let mut path = String::new();
            for (i, p) in shape.points.iter().enumerate() {
                let cmd = if i == 0 { "moveTo" } else { "lnTo" };
                path.push_str(&format!(
                    "<a:{cmd}><a:pt x=\"{}\" y=\"{}\"/></a:{cmd}>",
                    emu(p[0] - bx),
                    emu(p[1] - by)
                ));
            }
            format!(
                "<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"Freeform {id}\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>\
<p:spPr>{}<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l=\"0\" t=\"0\" r=\"{path_w}\" b=\"{path_h}\"/>\
<a:pathLst><a:path w=\"{path_w}\" h=\"{path_h}\">{path}</a:path></a:pathLst></a:custGeom>\
<a:noFill/>{}</p:spPr></p:sp>",
                xfrm(bx, by, bw, bh, false, false),
                line_xml(shape, false)
            )
        }
        "text" => {
            format!(
                "<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"Text {id}\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/></p:nvSpPr>\
<p:spPr>{}<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>{}</p:sp>",
                xfrm(shape.x, shape.y, shape.w, shape.h, false, false),
                text_body(shape)
            )
        }
        // rect and ellipse
        _ => {
            let prst = if shape.kind == "ellipse" { "ellipse" } else { "rect" };
            format!(
                "<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"Shape {id}\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>\
<p:spPr>{}<a:prstGeom prst=\"{prst}\"><a:avLst/></a:prstGeom>{}{}</p:spPr></p:sp>",
                xfrm(shape.x, shape.y, shape.w, shape.h, false, false),
                fill_xml(&shape.fill),
                line_xml(shape, false)
            )
        }
    }
}

fn pen_bbox(points: &[[f64; 2]]) -> (f64, f64, f64, f64) {
    if points.is_empty() {
        return (0.0, 0.0, 1.0, 1.0);
    }
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for p in points {
        x0 = x0.min(p[0]);
        y0 = y0.min(p[1]);
        x1 = x1.max(p[0]);
        y1 = y1.max(p[1]);
    }
    (x0, y0, (x1 - x0).max(0.1), (y1 - y0).max(0.1))
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

pub fn read<R: Read + Seek>(input: R) -> Result<Deck, String> {
    let mut archive = zip::ZipArchive::new(input).map_err(|e| e.to_string())?;

    // Slide parts are ppt/slides/slideN.xml. The order in the file list is
    // arbitrary, so sort by N. Reading sldIdLst would be more correct for
    // exotic producers, but every editor seen so far numbers parts in order.
    let mut names: Vec<(u32, String)> = Vec::new();
    for i in 0..archive.len() {
        let name = archive
            .by_index(i)
            .map_err(|e| e.to_string())?
            .name()
            .to_string();
        if let Some(rest) = name.strip_prefix("ppt/slides/slide") {
            if let Some(num) = rest.strip_suffix(".xml") {
                if let Ok(n) = num.parse::<u32>() {
                    names.push((n, name));
                }
            }
        }
    }
    names.sort();
    if names.is_empty() {
        return Err("no slides found in file".into());
    }

    let mut deck = Deck::default();
    for (_, name) in names {
        let mut xml = String::new();
        archive
            .by_name(&name)
            .map_err(|e| e.to_string())?
            .read_to_string(&mut xml)
            .map_err(|e| e.to_string())?;
        deck.slides.push(parse_slide(&xml)?);
    }
    Ok(deck)
}

#[derive(Default)]
struct Pending {
    is_cxn: bool,
    tx_box: bool,
    x: i64,
    y: i64,
    cx: i64,
    cy: i64,
    flip_h: bool,
    flip_v: bool,
    prst: Option<String>,
    has_custgeom: bool,
    path_pts: Vec<(i64, i64)>,
    stroke: Option<String>,
    stroke_none: bool,
    stroke_w: Option<i64>,
    dash: Option<String>,
    arrow: bool,
    fill: Option<String>,
    text: String,
    font_size: Option<f64>,
    text_color: Option<String>,
}

fn attr(e: &quick_xml::events::BytesStart, name: &[u8]) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        if a.key.local_name().as_ref() == name {
            String::from_utf8(a.value.to_vec()).ok()
        } else {
            None
        }
    })
}

fn in_ctx(stack: &[String], name: &str) -> bool {
    stack.iter().any(|s| s == name)
}

fn parse_slide(xml: &str) -> Result<Slide, String> {
    let mut reader = Reader::from_str(xml);
    let mut slide = Slide::default();
    let mut stack: Vec<String> = Vec::new();
    let mut pending: Option<Pending> = None;
    // Depth of nested groups. Shapes inside a group use group-relative
    // coordinates this reader does not resolve, so they are skipped.
    let mut group_depth = 0u32;

    loop {
        let event = reader.read_event().map_err(|e| e.to_string())?;
        match event {
            Event::Start(ref e) | Event::Empty(ref e) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                let empty = matches!(event, Event::Empty(_));

                if local == "grpSp" && !empty {
                    group_depth += 1;
                } else if group_depth == 0 && (local == "sp" || local == "cxnSp") && !empty {
                    pending = Some(Pending {
                        is_cxn: local == "cxnSp",
                        ..Pending::default()
                    });
                } else if let Some(p) = pending.as_mut() {
                    handle_element(p, &local, e, &stack);
                }

                if !empty {
                    stack.push(local);
                }
            }
            Event::Text(ref t) => {
                if let Some(p) = pending.as_mut() {
                    if in_ctx(&stack, "txBody") && stack.last().map(String::as_str) == Some("t") {
                        p.text.push_str(&t.decode().map_err(|e| e.to_string())?);
                    }
                }
            }
            // quick-xml hands &lt; &amp; and friends over as separate
            // reference events instead of resolving them inside Text.
            Event::GeneralRef(ref e) => {
                if let Some(p) = pending.as_mut() {
                    if in_ctx(&stack, "txBody") && stack.last().map(String::as_str) == Some("t") {
                        let ch = match e.as_ref() {
                            b"lt" => Some('<'),
                            b"gt" => Some('>'),
                            b"amp" => Some('&'),
                            b"quot" => Some('"'),
                            b"apos" => Some('\''),
                            _ => e.resolve_char_ref().ok().flatten(),
                        };
                        if let Some(ch) = ch {
                            p.text.push(ch);
                        }
                    }
                }
            }
            Event::End(ref e) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                stack.pop();
                if local == "grpSp" {
                    group_depth = group_depth.saturating_sub(1);
                } else if (local == "sp" || local == "cxnSp") && group_depth == 0 {
                    if let Some(p) = pending.take() {
                        if let Some(shape) = finish(p) {
                            slide.shapes.push(shape);
                        }
                    }
                } else if local == "p" && in_ctx(&stack, "txBody") {
                    if let Some(p) = pending.as_mut() {
                        p.text.push('\n');
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(slide)
}

fn handle_element(
    p: &mut Pending,
    local: &str,
    e: &quick_xml::events::BytesStart,
    stack: &[String],
) {
    let get = |name: &[u8]| attr(e, name);
    match local {
        "cNvSpPr" => {
            if get(b"txBox").as_deref() == Some("1") {
                p.tx_box = true;
            }
        }
        "xfrm" if !in_ctx(stack, "txBody") => {
            p.flip_h = get(b"flipH").as_deref() == Some("1");
            p.flip_v = get(b"flipV").as_deref() == Some("1");
        }
        "off" => {
            p.x = get(b"x").and_then(|v| v.parse().ok()).unwrap_or(0);
            p.y = get(b"y").and_then(|v| v.parse().ok()).unwrap_or(0);
        }
        "ext" => {
            p.cx = get(b"cx").and_then(|v| v.parse().ok()).unwrap_or(0);
            p.cy = get(b"cy").and_then(|v| v.parse().ok()).unwrap_or(0);
        }
        "prstGeom" => p.prst = get(b"prst"),
        "custGeom" => p.has_custgeom = true,
        "pt" if in_ctx(stack, "pathLst") => {
            let x = get(b"x").and_then(|v| v.parse().ok()).unwrap_or(0);
            let y = get(b"y").and_then(|v| v.parse().ok()).unwrap_or(0);
            p.path_pts.push((x, y));
        }
        "ln" if in_ctx(stack, "spPr") => p.stroke_w = get(b"w").and_then(|v| v.parse().ok()),
        "srgbClr" => {
            let color = get(b"val").map(|v| format!("#{}", v.to_lowercase()));
            if in_ctx(stack, "ln") {
                p.stroke = color;
            } else if in_ctx(stack, "rPr") {
                p.text_color = color;
            } else if in_ctx(stack, "spPr") && !in_ctx(stack, "txBody") {
                p.fill = color;
            }
        }
        "noFill" => {
            if in_ctx(stack, "ln") {
                p.stroke_none = true;
            } else if in_ctx(stack, "spPr") && !in_ctx(stack, "txBody") {
                p.fill = Some("none".into());
            }
        }
        "prstDash" => p.dash = get(b"val"),
        "tailEnd" | "headEnd" => {
            if get(b"type").map(|t| t != "none").unwrap_or(false) {
                p.arrow = true;
            }
        }
        "rPr" if p.font_size.is_none() => {
            p.font_size = get(b"sz")
                .and_then(|v| v.parse::<f64>().ok())
                .map(|sz| (sz / 100.0 * 1.3333 * 10.0).round() / 10.0);
        }
        _ => {}
    }
}

fn finish(p: Pending) -> Option<Shape> {
    let mut shape = Shape::default();
    let is_line = p.is_cxn
        || matches!(
            p.prst.as_deref(),
            Some("line") | Some("straightConnector1")
        );

    if p.has_custgeom {
        shape.kind = "pen".into();
        shape.points = p
            .path_pts
            .iter()
            .map(|(x, y)| [px(p.x + x), px(p.y + y)])
            .collect();
        if shape.points.is_empty() {
            return None;
        }
    } else if is_line {
        shape.kind = if p.arrow { "arrow" } else { "line" }.into();
        // Stored as start -> end; flips say which corner of the box starts.
        shape.x = px(if p.flip_h { p.x + p.cx } else { p.x });
        shape.y = px(if p.flip_v { p.y + p.cy } else { p.y });
        shape.w = px(if p.flip_h { -p.cx } else { p.cx });
        shape.h = px(if p.flip_v { -p.cy } else { p.cy });
    } else {
        shape.kind = if p.tx_box || (!p.text.trim().is_empty() && p.stroke.is_none()) {
            "text".into()
        } else if p.prst.as_deref() == Some("ellipse") {
            "ellipse".into()
        } else {
            // Every other preset is drawn as its bounding rectangle rather
            // than dropped, so the slide stays editable.
            "rect".into()
        };
        shape.x = px(p.x);
        shape.y = px(p.y);
        shape.w = px(p.cx);
        shape.h = px(p.cy);
    }

    if let Some(color) = p.fill {
        shape.fill = color;
    }
    if p.stroke_none {
        shape.stroke = "none".into();
    } else if let Some(color) = p.stroke {
        shape.stroke = color;
    } else if shape.kind == "text" {
        shape.stroke = "none".into();
    }
    if let Some(w) = p.stroke_w {
        shape.stroke_width = ((w as f64 / EMU_PER_PX) * 100.0).round() / 100.0;
    }
    shape.dash = match p.dash.as_deref() {
        Some("dash") | Some("sysDash") | Some("lgDash") => "dash".into(),
        Some("dot") | Some("sysDot") => "dot".into(),
        _ => "solid".into(),
    };
    let text = p.text.trim_end_matches('\n');
    if !text.is_empty() {
        shape.text = text.to_string();
        if let Some(sz) = p.font_size {
            shape.font_size = sz;
        }
        if let Some(color) = p.text_color {
            shape.text_color = color;
        }
    }
    Some(shape)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sample_deck() -> Deck {
        Deck {
            slides: vec![
                Slide {
                    shapes: vec![
                        Shape {
                            kind: "rect".into(),
                            x: 100.0,
                            y: 80.0,
                            w: 300.0,
                            h: 160.0,
                            fill: "#ffd43b".into(),
                            stroke: "#e03131".into(),
                            stroke_width: 3.0,
                            dash: "dash".into(),
                            ..Shape::default()
                        },
                        Shape {
                            kind: "ellipse".into(),
                            x: 500.0,
                            y: 200.0,
                            w: 180.0,
                            h: 180.0,
                            ..Shape::default()
                        },
                        Shape {
                            kind: "arrow".into(),
                            x: 700.0,
                            y: 400.0,
                            w: -200.0,
                            h: 120.0,
                            stroke: "#1971c2".into(),
                            ..Shape::default()
                        },
                        Shape {
                            kind: "text".into(),
                            x: 200.0,
                            y: 500.0,
                            w: 400.0,
                            h: 100.0,
                            text: "hello <deck>\nsecond & line".into(),
                            font_size: 32.0,
                            text_color: "#2f9e44".into(),
                            stroke: "none".into(),
                            ..Shape::default()
                        },
                    ],
                },
                Slide {
                    shapes: vec![Shape {
                        kind: "pen".into(),
                        points: vec![[10.0, 20.0], [50.0, 60.0], [90.0, 30.0]],
                        stroke: "#862e9c".into(),
                        stroke_width: 4.0,
                        dash: "dot".into(),
                        ..Shape::default()
                    }],
                },
            ],
        }
    }

    #[test]
    fn round_trip_preserves_shapes() {
        let deck = sample_deck();
        let mut buffer = Cursor::new(Vec::new());
        write(&deck, &mut buffer).unwrap();
        buffer.set_position(0);
        let back = read(buffer).unwrap();

        assert_eq!(back.slides.len(), 2);
        let close = |a: f64, b: f64| (a - b).abs() < 0.5;
        for (slide_a, slide_b) in deck.slides.iter().zip(&back.slides) {
            assert_eq!(slide_a.shapes.len(), slide_b.shapes.len());
            for (a, b) in slide_a.shapes.iter().zip(&slide_b.shapes) {
                assert_eq!(a.kind, b.kind);
                assert_eq!(a.stroke, b.stroke);
                assert_eq!(a.dash, b.dash);
                assert_eq!(a.fill, b.fill);
                assert_eq!(a.text, b.text);
                assert!(close(a.stroke_width, b.stroke_width));
                if a.kind == "pen" {
                    assert_eq!(a.points.len(), b.points.len());
                    for (pa, pb) in a.points.iter().zip(&b.points) {
                        assert!(close(pa[0], pb[0]) && close(pa[1], pb[1]));
                    }
                } else {
                    assert!(close(a.x, b.x) && close(a.y, b.y));
                    assert!(close(a.w, b.w) && close(a.h, b.h));
                }
                if a.kind == "text" {
                    assert!(close(a.font_size, b.font_size));
                    assert_eq!(a.text_color, b.text_color);
                }
            }
        }
    }

    #[test]
    fn written_file_contains_required_parts() {
        let mut buffer = Cursor::new(Vec::new());
        write(&sample_deck(), &mut buffer).unwrap();
        buffer.set_position(0);
        let mut archive = zip::ZipArchive::new(buffer).unwrap();
        for part in [
            "[Content_Types].xml",
            "_rels/.rels",
            "ppt/presentation.xml",
            "ppt/slideMasters/slideMaster1.xml",
            "ppt/slideLayouts/slideLayout1.xml",
            "ppt/theme/theme1.xml",
            "ppt/slides/slide1.xml",
            "ppt/slides/slide2.xml",
        ] {
            assert!(archive.by_name(part).is_ok(), "missing {part}");
        }
    }

    #[test]
    fn empty_deck_still_writes_one_slide() {
        let mut buffer = Cursor::new(Vec::new());
        write(&Deck::default(), &mut buffer).unwrap();
        buffer.set_position(0);
        let back = read(buffer).unwrap();
        assert_eq!(back.slides.len(), 1);
        assert!(back.slides[0].shapes.is_empty());
    }
}
