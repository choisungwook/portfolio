//! Read and write .pptx files.
//!
//! A .pptx is a zip of XML parts. Writing builds each part from string
//! templates: the presentation, one master, one blank layout, one theme, and
//! one part per slide. Reading follows each slide's layout, master and theme,
//! then keeps what this editor understands: preset shapes, flattened groups,
//! backgrounds, pictures, freehand paths, and text boxes with inherited
//! placeholder styling. Unsupported tables are skipped.

use crate::{Deck, Shape, Slide, EMU_PER_PX, SLIDE_H, SLIDE_W};
use base64::Engine;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::HashMap;
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
    let mut add = |name: &str, body: &[u8]| -> Result<(), String> {
        zip.start_file(name, opts).map_err(|e| e.to_string())?;
        zip.write_all(body).map_err(|e| e.to_string())
    };

    let n = deck.slides.len().max(1);
    add("[Content_Types].xml", content_types(n).as_bytes())?;
    add("_rels/.rels", ROOT_RELS.as_bytes())?;
    add("ppt/presentation.xml", presentation(n).as_bytes())?;
    add("ppt/_rels/presentation.xml.rels", presentation_rels(n).as_bytes())?;
    add("ppt/slideMasters/slideMaster1.xml", MASTER.as_bytes())?;
    add(
        "ppt/slideMasters/_rels/slideMaster1.xml.rels",
        MASTER_RELS.as_bytes(),
    )?;
    add("ppt/slideLayouts/slideLayout1.xml", LAYOUT.as_bytes())?;
    add(
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
        LAYOUT_RELS.as_bytes(),
    )?;
    add("ppt/theme/theme1.xml", THEME.as_bytes())?;

    let empty = Slide::default();
    let mut media = MediaStore::default();
    for i in 0..n {
        let slide = deck.slides.get(i).unwrap_or(&empty);
        let (xml, rels) = slide_xml(slide, &mut media);
        add(&format!("ppt/slides/slide{}.xml", i + 1), xml.as_bytes())?;
        add(
            &format!("ppt/slides/_rels/slide{}.xml.rels", i + 1),
            rels.as_bytes(),
        )?;
    }
    for (name, bytes) in &media.files {
        add(&format!("ppt/media/{name}"), bytes)?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Media parts written so far, deduplicated by the exact data URL so a
/// picture pasted on every slide is stored once.
#[derive(Default)]
struct MediaStore {
    files: Vec<(String, Vec<u8>)>,
    by_src: HashMap<String, String>,
}

impl MediaStore {
    /// The media file name for this data URL, or None when it cannot be
    /// decoded into a format pptx readers show.
    fn intern(&mut self, src: &str) -> Option<String> {
        if let Some(name) = self.by_src.get(src) {
            return Some(name.clone());
        }
        let (ext, bytes) = decode_data_url(src)?;
        let name = format!("image{}.{ext}", self.files.len() + 1);
        self.files.push((name.clone(), bytes));
        self.by_src.insert(src.into(), name.clone());
        Some(name)
    }
}

/// The picture formats that survive a round trip: a webview draws them in
/// an image element, and pptx readers accept them as a picture part. Both
/// directions and the content types read this one table, so import can
/// never accept a format export would silently drop.
const IMAGE_FORMATS: [(&str, &str); 6] = [
    ("png", "image/png"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("svg", "image/svg+xml"),
    ("webp", "image/webp"),
    ("bmp", "image/bmp"),
];

/// The media part extension for a mime type, e.g. image/png -> png.
fn ext_for_mime(mime: &str) -> Option<&'static str> {
    IMAGE_FORMATS
        .iter()
        .find(|(_, m)| *m == mime)
        .map(|(ext, _)| *ext)
}

/// The mime type for a media part extension. Only .jpg needs an alias;
/// every other extension is already the table's own spelling.
fn mime_for_ext(ext: &str) -> Option<&'static str> {
    let ext = ext.to_ascii_lowercase();
    let ext = if ext == "jpg" { "jpeg" } else { &ext };
    IMAGE_FORMATS
        .iter()
        .find(|(e, _)| *e == ext)
        .map(|(_, mime)| *mime)
}

fn decode_data_url(src: &str) -> Option<(&'static str, Vec<u8>)> {
    let rest = src.strip_prefix("data:")?;
    let (mime, b64) = rest.split_once(";base64,")?;
    let ext = ext_for_mime(mime)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .ok()?;
    Some((ext, bytes))
}

fn content_types(slides: usize) -> String {
    let mut overrides = String::new();
    for i in 1..=slides {
        overrides.push_str(&format!(
            "<Override PartName=\"/ppt/slides/slide{i}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>"
        ));
    }
    // Every writable picture format needs its extension declared here, or
    // the package is invalid for readers that check.
    let mut images = String::new();
    for (ext, mime) in IMAGE_FORMATS {
        images.push_str(&format!(
            "<Default Extension=\"{ext}\" ContentType=\"{mime}\"/>"
        ));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\
<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\
<Default Extension=\"xml\" ContentType=\"application/xml\"/>\
{images}\
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

const SLIDE_REL_LAYOUT: &str = "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>";

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

fn slide_xml(slide: &Slide, media: &mut MediaStore) -> (String, String) {
    let mut shapes = String::new();
    let mut rels = String::from(SLIDE_REL_LAYOUT);
    // rId1 is the layout; image relationships follow it.
    let mut next_rid = 2u64;
    let mut next_id = 2u64;
    let mut open_group = String::new();
    for shape in &slide.shapes {
        if shape.group_id != open_group {
            if !open_group.is_empty() {
                shapes.push_str("</p:grpSp>");
            }
            if !shape.group_id.is_empty() {
                shapes.push_str(&group_xml(next_id, &shape.group_id));
                next_id += 1;
            }
            open_group = shape.group_id.clone();
        }
        // id 1 (tree) is taken; shape ids start at 2.
        let id = next_id;
        next_id += 1;
        if shape.kind == "image" {
            // An image whose data URL cannot be decoded is dropped rather
            // than written as a broken relationship.
            if let Some(name) = media.intern(&shape.src) {
                shapes.push_str(&pic_xml(shape, id, next_rid));
                rels.push_str(&format!(
                    "<Relationship Id=\"rId{next_rid}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/{name}\"/>"
                ));
                next_rid += 1;
            }
        } else {
            shapes.push_str(&shape_xml(shape, id));
        }
    }
    if !open_group.is_empty() {
        shapes.push_str("</p:grpSp>");
    }
    let xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<p:sld{NS}><p:cSld>{}<p:spTree>{EMPTY_TREE_HEADER}{shapes}</p:spTree></p:cSld>\
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>",
        background_xml(&slide.background)
    );
    let rels = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">{rels}</Relationships>"
    );
    (xml, rels)
}

fn group_xml(id: u64, name: &str) -> String {
    format!(
        "<p:grpSp><p:nvGrpSpPr><p:cNvPr id=\"{id}\" name=\"{}\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\
<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"{}\" cy=\"{}\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"{}\" cy=\"{}\"/></a:xfrm></p:grpSpPr>",
        xml_escape(name),
        emu(SLIDE_W),
        emu(SLIDE_H),
        emu(SLIDE_W),
        emu(SLIDE_H),
    )
}

/// The slide's `p:bg` element, empty for white. The master this writer emits
/// already resolves to white, so leaving the element out says the same thing
/// in fewer bytes and keeps files written before backgrounds existed
/// byte-identical.
fn background_xml(background: &str) -> String {
    if background.is_empty()
        || background == "none"
        || background.eq_ignore_ascii_case("#ffffff")
    {
        return String::new();
    }
    format!(
        "<p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"{}\"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>",
        hex(background)
    )
}

fn pic_xml(shape: &Shape, id: u64, rid: u64) -> String {
    let crop = if shape.crop_left != 0.0
        || shape.crop_top != 0.0
        || shape.crop_right != 0.0
        || shape.crop_bottom != 0.0
    {
        format!(
            "<a:srcRect l=\"{}\" t=\"{}\" r=\"{}\" b=\"{}\"/>",
            (shape.crop_left * 100000.0).round() as i64,
            (shape.crop_top * 100000.0).round() as i64,
            (shape.crop_right * 100000.0).round() as i64,
            (shape.crop_bottom * 100000.0).round() as i64,
        )
    } else {
        String::new()
    };
    let rotation = if shape.rotation == 0.0 {
        String::new()
    } else {
        format!(" rot=\"{}\"", (shape.rotation * 60000.0).round() as i64)
    };
    format!(
        "<p:pic><p:nvPicPr><p:cNvPr id=\"{id}\" name=\"Picture {id}\"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>\
<p:blipFill><a:blip r:embed=\"rId{rid}\"/>{crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>\
<p:spPr><a:xfrm{rotation}><a:off x=\"{}\" y=\"{}\"/><a:ext cx=\"{}\" cy=\"{}\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom>{}</p:spPr></p:pic>",
        emu(shape.x),
        emu(shape.y),
        emu(shape.w).max(1),
        emu(shape.h).max(1),
        line_xml(shape, false),
    )
}

fn line_xml(shape: &Shape, arrow: bool) -> String {
    let w = emu(shape.stroke_width).max(1);
    if shape.stroke == "none" {
        return format!("<a:ln w=\"{w}\"><a:noFill/></a:ln>");
    }
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
    let latin = format!(
        "<a:latin typeface=\"{}\"/>",
        xml_escape(&shape.font_family)
    );
    let bold = if shape.bold { " b=\"1\"" } else { "" };
    let italic = if shape.italic { " i=\"1\"" } else { "" };
    let underline = if shape.underline { " u=\"sng\"" } else { "" };
    let align = match shape.text_align.as_str() {
        "center" => "ctr",
        "right" => "r",
        _ => "l",
    };
    let anchor = match shape.vertical_align.as_str() {
        "center" => "ctr",
        "bottom" => "b",
        _ => "t",
    };
    let mut paragraphs = String::new();
    for line in shape.text.split('\n') {
        paragraphs.push_str(&format!(
            "<a:p><a:pPr algn=\"{align}\"/><a:r><a:rPr lang=\"en-US\" sz=\"{size}\"{bold}{italic}{underline} dirty=\"0\"><a:solidFill><a:srgbClr val=\"{color}\"/></a:solidFill>{latin}</a:rPr><a:t>{}</a:t></a:r></a:p>",
            xml_escape(line)
        ));
    }
    format!(
        "<p:txBody><a:bodyPr wrap=\"square\" anchor=\"{anchor}\" lIns=\"0\" tIns=\"0\" rIns=\"0\" bIns=\"0\"><a:noAutofit/></a:bodyPr><a:lstStyle/>{paragraphs}</p:txBody>"
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
                line_xml(shape, shape.pen_arrow)
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

    // The declared page size, for fitting foreign canvases onto 1280x720.
    let sld_sz = part(&mut archive, "ppt/presentation.xml").and_then(|xml| parse_sld_sz(&xml));
    let (page_w, page_h) = sld_sz
        .map(|(cx, cy)| (cx / EMU_PER_PX, cy / EMU_PER_PX))
        .unwrap_or((SLIDE_W, SLIDE_H));

    let mut media_cache: HashMap<String, String> = HashMap::new();

    let mut deck = Deck::default();
    for (_, name) in names {
        let xml = part(&mut archive, &name).ok_or(format!("cannot read {name}"))?;
        let rels = rels_for_part(&mut archive, &name);
        let layout_path = relation_target(&rels, "/slideLayout");
        let layout_xml = layout_path.as_deref().and_then(|path| part(&mut archive, path));
        let layout_rels = layout_path
            .as_deref()
            .map(|path| rels_for_part(&mut archive, path))
            .unwrap_or_default();
        let master_path = relation_target(&layout_rels, "/slideMaster")
            .unwrap_or_else(|| "ppt/slideMasters/slideMaster1.xml".into());
        let master_xml = part(&mut archive, &master_path);
        let master_rels = rels_for_part(&mut archive, &master_path);
        let theme_path = relation_target(&master_rels, "/theme")
            .unwrap_or_else(|| "ppt/theme/theme1.xml".into());
        let scheme = part(&mut archive, &theme_path)
            .map(|theme| parse_scheme(&theme))
            .unwrap_or_default();

        let master_clr_map = master_xml
            .as_deref()
            .map(parse_clr_map)
            .unwrap_or_default();
        let master_text = master_xml
            .as_deref()
            .map(|master| parse_master_text_styles(master, &scheme, &master_clr_map))
            .transpose()?
            .unwrap_or_default();
        let master_ctx = SlideCtx {
            scheme: &scheme,
            clr_map: &master_clr_map,
            rels: &master_rels,
            defaults: &master_text,
        };
        let master = master_xml
            .as_deref()
            .map(|master| parse_part(master, &master_ctx, false))
            .transpose()?
            .unwrap_or_default();
        let master_defaults = merged_placeholders(&master_text, &master.placeholders);

        let layout_clr_map = layout_xml
            .as_deref()
            .map(parse_clr_map)
            .filter(|map| !map.is_empty())
            .unwrap_or_else(|| master_clr_map.clone());
        let layout_ctx = SlideCtx {
            scheme: &scheme,
            clr_map: &layout_clr_map,
            rels: &layout_rels,
            defaults: &master_defaults,
        };
        let layout = layout_xml
            .as_deref()
            .map(|layout| parse_part(layout, &layout_ctx, false))
            .transpose()?
            .unwrap_or_default();

        let defaults = merged_placeholders(&master_defaults, &layout.placeholders);
        let slide_clr_map = {
            let map = parse_clr_map(&xml);
            if map.is_empty() {
                layout_clr_map.clone()
            } else {
                map
            }
        };
        let slide_ctx = SlideCtx {
            scheme: &scheme,
            clr_map: &slide_clr_map,
            rels: &rels,
            defaults: &defaults,
        };
        let slide = parse_part(&xml, &slide_ctx, true)?;

        let mut shapes = Vec::new();
        let bg = parse_background(&xml, &slide_ctx, page_w, page_h)
            .or_else(|| {
                layout_xml
                    .as_deref()
                    .and_then(|layout| parse_background(layout, &layout_ctx, page_w, page_h))
            })
            .or_else(|| {
                master_xml
                    .as_deref()
                    .and_then(|master| parse_background(master, &master_ctx, page_w, page_h))
            });
        // A solid background is the slide's own color. Only a picture has to
        // stay a shape, since a slide holds one color and not an image.
        let mut background = crate::default_background();
        if let Some(shape) = bg {
            if shape.kind == "image" {
                shapes.push(shape);
            } else {
                background = shape.fill;
            }
        }
        shapes.extend(master.visible);
        shapes.extend(layout.visible);
        shapes.extend(slide.visible);

        // Image shapes leave parse_part holding the media part path; swap
        // it for a data URL, dropping shapes whose bytes cannot be shown.
        let mut i = 0;
        while i < shapes.len() {
            if shapes[i].kind == "image" {
                match media_data_url(&mut archive, &mut media_cache, &shapes[i].src) {
                    Some(url) => {
                        shapes[i].src = url;
                        i += 1;
                    }
                    None => {
                        shapes.remove(i);
                    }
                }
            } else {
                i += 1;
            }
        }
        deck.slides.push(Slide { shapes, background });
    }

    // Other editors use other canvases: 4:3, Google Slides' smaller 16:9,
    // portrait one-offs. Fit whatever size the file declares onto this
    // editor's 1280x720 while keeping the aspect ratio.
    if let Some((cx, cy)) = sld_sz {
        let scale = (SLIDE_W * EMU_PER_PX / cx).min(SLIDE_H * EMU_PER_PX / cy);
        if (scale - 1.0).abs() > 0.001 {
            for slide in &mut deck.slides {
                for shape in &mut slide.shapes {
                    scale_shape(shape, scale);
                }
            }
        }
    }
    Ok(deck)
}

fn parse_sld_sz(xml: &str) -> Option<(f64, f64)> {
    let mut reader = Reader::from_str(xml);
    while let Ok(event) = reader.read_event() {
        match event {
            Event::Start(ref e) | Event::Empty(ref e) if e.local_name().as_ref() == b"sldSz" => {
                let cx: f64 = attr(e, b"cx")?.parse().ok()?;
                let cy: f64 = attr(e, b"cy")?.parse().ok()?;
                if cx > 0.0 && cy > 0.0 {
                    return Some((cx, cy));
                }
                return None;
            }
            Event::Eof => return None,
            _ => {}
        }
    }
    None
}

fn scale_shape(shape: &mut Shape, scale: f64) {
    let s = |v: f64| (v * scale * 100.0).round() / 100.0;
    shape.x = s(shape.x);
    shape.y = s(shape.y);
    shape.w = s(shape.w);
    shape.h = s(shape.h);
    for p in &mut shape.points {
        p[0] = s(p[0]);
        p[1] = s(p[1]);
    }
    shape.font_size = s(shape.font_size).max(1.0);
    shape.stroke_width = s(shape.stroke_width);
}

/// One zip entry as text, or None when missing or unreadable.
fn part<R: Read + Seek>(archive: &mut zip::ZipArchive<R>, name: &str) -> Option<String> {
    let mut text = String::new();
    archive.by_name(name).ok()?.read_to_string(&mut text).ok()?;
    Some(text)
}

fn relationships_path(part: &str) -> String {
    let (dir, file) = part.rsplit_once('/').unwrap_or(("", part));
    if dir.is_empty() {
        format!("_rels/{file}.rels")
    } else {
        format!("{dir}/_rels/{file}.rels")
    }
}

fn rels_for_part<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    owner: &str,
) -> HashMap<String, (String, String)> {
    part(archive, &relationships_path(owner))
        .map(|xml| parse_rels_for_owner(&xml, owner))
        .unwrap_or_default()
}

fn relation_target(
    rels: &HashMap<String, (String, String)>,
    suffix: &str,
) -> Option<String> {
    rels.values()
        .find(|(kind, _)| kind.ends_with(suffix))
        .map(|(_, target)| target.clone())
}

fn merged_placeholders(
    base: &HashMap<String, Shape>,
    over: &HashMap<String, Shape>,
) -> HashMap<String, Shape> {
    let mut merged = base.clone();
    merged.extend(over.clone());
    merged
}

fn media_data_url<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    cache: &mut HashMap<String, String>,
    path: &str,
) -> Option<String> {
    if let Some(url) = cache.get(path) {
        return Some(url.clone());
    }
    let mime = mime_for_ext(path.rsplit('.').next().unwrap_or(""))?;
    let mut bytes = Vec::new();
    archive.by_name(path).ok()?.read_to_end(&mut bytes).ok()?;
    let url = format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    );
    cache.insert(path.into(), url.clone());
    Some(url)
}

/// What one slide part needs from the rest of the package.
struct SlideCtx<'a> {
    /// clrScheme name -> "RRGGBB".
    scheme: &'a HashMap<String, String>,
    /// clrMap alias -> clrScheme name, e.g. bg1 -> lt1.
    clr_map: &'a HashMap<String, String>,
    /// rId -> (relationship type, normalized target path).
    rels: &'a HashMap<String, (String, String)>,
    /// Placeholder key -> inherited box and text style.
    defaults: &'a HashMap<String, Shape>,
}

impl SlideCtx<'_> {
    fn scheme_hex(&self, name: &str) -> Option<String> {
        scheme_hex(self.scheme, self.clr_map, name)
    }
}

#[derive(Default)]
struct ParsedPart {
    visible: Vec<Shape>,
    placeholders: HashMap<String, Shape>,
}

fn scheme_hex(
    scheme: &HashMap<String, String>,
    clr_map: &HashMap<String, String>,
    name: &str,
) -> Option<String> {
    let slot = clr_map.get(name).map(String::as_str).unwrap_or(name);
    scheme.get(slot).map(|hex| format!("#{}", hex.to_lowercase()))
}

/// The background a slide, layout or master declares. Embedded pictures are
/// kept as page-sized images; solid and scheme colors come back as a rect
/// whose fill `read` lifts onto the slide's own background field.
fn parse_background(
    xml: &str,
    ctx: &SlideCtx,
    page_w: f64,
    page_h: f64,
) -> Option<Shape> {
    let mut reader = Reader::from_str(xml);
    let mut stack = Vec::new();
    let mut image_id = None;
    let mut color: Option<String> = None;
    while let Ok(event) = reader.read_event() {
        match event {
            Event::Start(ref e) | Event::Empty(ref e) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                let empty = matches!(event, Event::Empty(_));
                if in_ctx(&stack, "bg") {
                    match local.as_str() {
                        "blip" => image_id = attr(e, b"embed"),
                        "srgbClr" if color.is_none() => {
                            color = attr(e, b"val").map(|v| format!("#{}", v.to_lowercase()));
                        }
                        "schemeClr" if color.is_none() => {
                            color = attr(e, b"val").and_then(|v| ctx.scheme_hex(&v));
                        }
                        "lumMod" | "lumOff" | "shade" | "tint" => {
                            if let (Some(c), Some(val)) = (
                                color.as_deref(),
                                attr(e, b"val").and_then(|v| v.parse::<f64>().ok()),
                            ) {
                                color = Some(mod_color(c, &local, val / 100000.0));
                            }
                        }
                        _ => {}
                    }
                }
                if !empty {
                    stack.push(local);
                }
            }
            Event::End(ref e) => {
                let is_bg = e.local_name().as_ref() == b"bg";
                stack.pop();
                if is_bg {
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    let mut shape = Shape {
        w: page_w,
        h: page_h,
        stroke: "none".into(),
        ..Shape::default()
    };
    if let Some(id) = image_id {
        if let Some((_, target)) = ctx.rels.get(&id) {
            shape.kind = "image".into();
            shape.src = target.clone();
            return Some(shape);
        }
    }
    if let Some(color) = color {
        if color.eq_ignore_ascii_case("#ffffff") {
            return None;
        }
        shape.kind = "rect".into();
        shape.fill = color;
        return Some(shape);
    }
    None
}

fn resolve_target(owner: &str, target: &str) -> String {
    if let Some(absolute) = target.strip_prefix('/') {
        return absolute.to_string();
    }
    let mut parts = owner
        .rsplit_once('/')
        .map(|(dir, _)| dir.split('/').collect::<Vec<_>>())
        .unwrap_or_default();
    for component in target.split('/') {
        match component {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            value => parts.push(value),
        }
    }
    parts.join("/")
}

/// rId -> (type, target) with targets normalized onto zip entry names.
fn parse_rels_for_owner(xml: &str, owner: &str) -> HashMap<String, (String, String)> {
    let mut reader = Reader::from_str(xml);
    let mut rels = HashMap::new();
    while let Ok(event) = reader.read_event() {
        match event {
            Event::Start(ref e) | Event::Empty(ref e)
                if e.local_name().as_ref() == b"Relationship" =>
            {
                if let (Some(id), Some(kind), Some(target)) =
                    (attr(e, b"Id"), attr(e, b"Type"), attr(e, b"Target"))
                {
                    let target = resolve_target(owner, &target);
                    rels.insert(id, (kind, target));
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    rels
}

/// clrScheme name -> "RRGGBB" from a theme part.
fn parse_scheme(xml: &str) -> HashMap<String, String> {
    let mut reader = Reader::from_str(xml);
    let mut map = HashMap::new();
    let mut current: Option<String> = None;
    while let Ok(event) = reader.read_event() {
        match event {
            Event::Start(ref e) | Event::Empty(ref e) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                match local.as_str() {
                    "dk1" | "lt1" | "dk2" | "lt2" | "accent1" | "accent2" | "accent3"
                    | "accent4" | "accent5" | "accent6" | "hlink" | "folHlink" => {
                        current = Some(local)
                    }
                    "srgbClr" => {
                        if let (Some(name), Some(val)) = (&current, attr(e, b"val")) {
                            map.insert(name.clone(), val.to_ascii_uppercase());
                        }
                    }
                    "sysClr" => {
                        if let (Some(name), Some(val)) = (&current, attr(e, b"lastClr")) {
                            map.insert(name.clone(), val.to_ascii_uppercase());
                        }
                    }
                    _ => {}
                }
            }
            Event::End(ref e) => {
                let local = e.local_name();
                if local.as_ref() == b"clrScheme" {
                    break;
                }
                if matches!(
                    local.as_ref(),
                    b"dk1" | b"lt1" | b"dk2" | b"lt2" | b"accent1" | b"accent2" | b"accent3"
                        | b"accent4" | b"accent5" | b"accent6" | b"hlink" | b"folHlink"
                ) {
                    current = None;
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    map
}

/// The master's clrMap attributes, e.g. bg1 -> lt1.
fn parse_clr_map(xml: &str) -> HashMap<String, String> {
    let mut reader = Reader::from_str(xml);
    let mut map = HashMap::new();
    while let Ok(event) = reader.read_event() {
        match event {
            Event::Start(ref e) | Event::Empty(ref e)
                if e.local_name().as_ref() == b"clrMap" =>
            {
                for a in e.attributes().flatten() {
                    if let (Ok(key), Ok(val)) = (
                        String::from_utf8(a.key.local_name().as_ref().to_vec()),
                        String::from_utf8(a.value.to_vec()),
                    ) {
                        map.insert(key, val);
                    }
                }
                break;
            }
            Event::Eof => break,
            _ => {}
        }
    }
    map
}

#[derive(Default)]
struct Pending {
    is_cxn: bool,
    is_pic: bool,
    tx_box: bool,
    x: i64,
    y: i64,
    cx: i64,
    cy: i64,
    saw_off: bool,
    saw_ext: bool,
    flip_h: bool,
    flip_v: bool,
    rotation: f64,
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
    font_family: Option<String>,
    has_explicit_text_style: bool,
    accept_explicit_text_style: bool,
    bold: Option<bool>,
    italic: Option<bool>,
    underline: Option<bool>,
    text_align: Option<String>,
    vertical_align: Option<String>,
    blip: Option<String>,
    svg_blip: Option<String>,
    crop_left: f64,
    crop_top: f64,
    crop_right: f64,
    crop_bottom: f64,
    is_ph: bool,
    ph_type: Option<String>,
    ph_idx: Option<String>,
}

#[derive(Clone, Default)]
struct GroupTransform {
    id: String,
    x: i64,
    y: i64,
    cx: i64,
    cy: i64,
    child_x: i64,
    child_y: i64,
    child_cx: i64,
    child_cy: i64,
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

fn parse_part(
    xml: &str,
    ctx: &SlideCtx,
    placeholders_are_visible: bool,
) -> Result<ParsedPart, String> {
    let mut reader = Reader::from_str(xml);
    let mut part = ParsedPart::default();
    let mut stack: Vec<String> = Vec::new();
    let mut pending: Option<Pending> = None;
    let mut groups: Vec<GroupTransform> = Vec::new();
    let mut group_sequence = 0u64;

    loop {
        let event = reader.read_event().map_err(|e| e.to_string())?;
        match event {
            Event::Start(ref e) | Event::Empty(ref e) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                let empty = matches!(event, Event::Empty(_));

                if local == "grpSp" && !empty {
                    group_sequence += 1;
                    groups.push(GroupTransform {
                        id: format!("group-{group_sequence}"),
                        ..GroupTransform::default()
                    });
                } else if (local == "sp" || local == "cxnSp" || local == "pic") && !empty
                {
                    pending = Some(Pending {
                        is_cxn: local == "cxnSp",
                        is_pic: local == "pic",
                        ..Pending::default()
                    });
                } else if let Some(p) = pending.as_mut() {
                    handle_element(p, &local, e, &stack, ctx);
                } else if local == "cNvPr" && in_ctx(&stack, "grpSp") {
                    if let Some(name) = attr(e, b"name") {
                        if let Some(group) = groups.last_mut() {
                            group.id = name;
                        }
                    }
                } else if in_ctx(&stack, "grpSpPr") {
                    handle_group_element(groups.last_mut(), &local, e, &stack);
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
                if local == "rPr" {
                    if let Some(p) = pending.as_mut() {
                        p.accept_explicit_text_style = false;
                    }
                }
                if local == "grpSp" {
                    groups.pop();
                } else if local == "sp" || local == "cxnSp" || local == "pic" {
                    if let Some(p) = pending.take() {
                        let keys = placeholder_keys(&p);
                        let default = placeholder_default(&p, ctx.defaults);
                        if let Some(mut shape) = finish(p, ctx, default) {
                            apply_group_transforms(&mut shape, &groups);
                            if let Some(group) = groups.last() {
                                shape.group_id = group.id.clone();
                            }
                            if placeholders_are_visible || keys.is_empty() {
                                if keys.is_empty()
                                    || shape.kind == "image"
                                    || !shape.text.trim().is_empty()
                                    || shape.fill != Shape::default().fill
                                {
                                    part.visible.push(shape);
                                }
                            } else {
                                for key in keys {
                                    part.placeholders.insert(key, shape.clone());
                                }
                            }
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
    Ok(part)
}

fn handle_group_element(
    group: Option<&mut GroupTransform>,
    local: &str,
    e: &quick_xml::events::BytesStart,
    stack: &[String],
) {
    let Some(group) = group else { return };
    if stack.last().map(String::as_str) != Some("xfrm") {
        return;
    }
    let x = attr(e, b"x").and_then(|v| v.parse().ok()).unwrap_or(0);
    let y = attr(e, b"y").and_then(|v| v.parse().ok()).unwrap_or(0);
    let cx = attr(e, b"cx").and_then(|v| v.parse().ok()).unwrap_or(0);
    let cy = attr(e, b"cy").and_then(|v| v.parse().ok()).unwrap_or(0);
    match local {
        "off" => (group.x, group.y) = (x, y),
        "ext" => (group.cx, group.cy) = (cx, cy),
        "chOff" => (group.child_x, group.child_y) = (x, y),
        "chExt" => (group.child_cx, group.child_cy) = (cx, cy),
        _ => {}
    }
}

/// Which color of the shape a color element inside this context sets.
/// Colors inside effects (shadows, glows) belong to the effect, not the
/// shape, so they land nowhere.
fn color_slot<'a>(p: &'a mut Pending, stack: &[String]) -> Option<&'a mut Option<String>> {
    if in_ctx(stack, "effectLst") {
        None
    } else if in_ctx(stack, "ln") {
        Some(&mut p.stroke)
    } else if in_ctx(stack, "rPr") || in_ctx(stack, "defRPr") || in_ctx(stack, "endParaRPr") {
        Some(&mut p.text_color)
    } else if in_ctx(stack, "spPr") && !in_ctx(stack, "txBody") {
        Some(&mut p.fill)
    } else {
        None
    }
}

/// Approximate one DrawingML color modifier in plain sRGB. val is the raw
/// 0..100000 attribute scaled to 0..1. Exact math works in linear space;
/// this stays close enough for slide fills.
fn mod_color(color: &str, op: &str, val: f64) -> String {
    let c = color.trim_start_matches('#');
    if c.len() != 6 {
        return color.into();
    }
    let channel = |i: usize| u8::from_str_radix(&c[i..i + 2], 16).unwrap_or(0) as f64;
    let apply = |x: f64| match op {
        "shade" | "lumMod" => x * val,
        "tint" => x * val + 255.0 * (1.0 - val),
        "lumOff" => x + 255.0 * val,
        _ => x,
    };
    let clamp = |x: f64| apply(x).round().clamp(0.0, 255.0) as u8;
    format!(
        "#{:02x}{:02x}{:02x}",
        clamp(channel(0)),
        clamp(channel(2)),
        clamp(channel(4))
    )
}

fn handle_element(
    p: &mut Pending,
    local: &str,
    e: &quick_xml::events::BytesStart,
    stack: &[String],
    ctx: &SlideCtx,
) {
    let get = |name: &[u8]| attr(e, name);
    match local {
        "cNvSpPr" => {
            if get(b"txBox").as_deref() == Some("1") {
                p.tx_box = true;
            }
        }
        "ph" => {
            p.is_ph = true;
            p.ph_type = get(b"type");
            p.ph_idx = get(b"idx");
        }
        "blip" => {
            if p.is_pic && p.blip.is_none() {
                p.blip = get(b"embed");
            }
        }
        "svgBlip" if p.is_pic => p.svg_blip = get(b"embed"),
        "xfrm" if !in_ctx(stack, "txBody") => {
            p.flip_h = get(b"flipH").as_deref() == Some("1");
            p.flip_v = get(b"flipV").as_deref() == Some("1");
            p.rotation = get(b"rot")
                .and_then(|v| v.parse::<f64>().ok())
                .map(|value| value / 60000.0)
                .unwrap_or(0.0);
        }
        "off" if in_ctx(stack, "xfrm") => {
            p.x = get(b"x").and_then(|v| v.parse().ok()).unwrap_or(0);
            p.y = get(b"y").and_then(|v| v.parse().ok()).unwrap_or(0);
            p.saw_off = true;
        }
        // a:ext is also the extension-list element, which has a uri instead
        // of a size; only a real size counts.
        "ext" if in_ctx(stack, "xfrm") => {
            if let (Some(cx), Some(cy)) = (
                get(b"cx").and_then(|v| v.parse().ok()),
                get(b"cy").and_then(|v| v.parse().ok()),
            ) {
                p.cx = cx;
                p.cy = cy;
                p.saw_ext = true;
            }
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
            assign_color(p, color, stack);
        }
        "schemeClr" => {
            assign_color(p, get(b"val").and_then(|v| ctx.scheme_hex(&v)), stack);
        }
        "lumMod" | "lumOff" | "shade" | "tint"
            if in_ctx(stack, "srgbClr") || in_ctx(stack, "schemeClr") =>
        {
            if let Some(val) = get(b"val").and_then(|v| v.parse::<f64>().ok()) {
                if let Some(slot) = color_slot(p, stack) {
                    if let Some(color) = slot.as_deref() {
                        *slot = Some(mod_color(color, local, val / 100000.0));
                    }
                }
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
        "rPr" => {
            if in_ctx(stack, "r") && !p.has_explicit_text_style {
                p.has_explicit_text_style = true;
                p.accept_explicit_text_style = true;
                overwrite_text_properties(p, e);
            } else if !p.has_explicit_text_style {
                read_text_properties(p, e);
            }
        }
        "defRPr" | "endParaRPr" => read_text_properties(p, e),
        "latin"
            if (p.accept_explicit_text_style || p.font_family.is_none())
                && (in_ctx(stack, "rPr")
                    || in_ctx(stack, "defRPr")
                    || in_ctx(stack, "endParaRPr")) =>
        {
            p.font_family = get(b"typeface").filter(|t| !t.is_empty());
        }
        "pPr" | "lvl1pPr" if p.text_align.is_none() => {
            p.text_align = get(b"algn").map(|value| match value.as_str() {
                "ctr" => "center".into(),
                "r" => "right".into(),
                _ => "left".into(),
            });
        }
        "bodyPr" => {
            p.vertical_align = get(b"anchor").map(|value| match value.as_str() {
                "ctr" => "center".into(),
                "b" => "bottom".into(),
                _ => "top".into(),
            });
        }
        "srcRect" => {
            p.crop_left = crop_value(get(b"l"));
            p.crop_top = crop_value(get(b"t"));
            p.crop_right = crop_value(get(b"r"));
            p.crop_bottom = crop_value(get(b"b"));
        }
        "br" if in_ctx(stack, "txBody") => p.text.push('\n'),
        _ => {}
    }
}

fn crop_value(value: Option<String>) -> f64 {
    value
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| value / 100000.0)
        .unwrap_or(0.0)
}

fn assign_color(p: &mut Pending, color: Option<String>, stack: &[String]) {
    if in_ctx(stack, "effectLst") {
        return;
    }
    if in_ctx(stack, "ln") {
        p.stroke = color;
    } else if in_ctx(stack, "rPr")
        || in_ctx(stack, "defRPr")
        || in_ctx(stack, "endParaRPr")
    {
        if p.accept_explicit_text_style
            || (!p.has_explicit_text_style && p.text_color.is_none())
        {
            p.text_color = color;
        }
    } else if in_ctx(stack, "spPr") && !in_ctx(stack, "txBody") {
        p.fill = color;
    }
}

fn read_text_properties(p: &mut Pending, e: &quick_xml::events::BytesStart) {
    if p.font_size.is_none() {
        p.font_size = attr(e, b"sz")
            .and_then(|v| v.parse::<f64>().ok())
            .map(|sz| (sz / 100.0 * 1.3333 * 10.0).round() / 10.0);
    }
    if p.bold.is_none() {
        p.bold = attr(e, b"b").map(|value| value == "1");
    }
    if p.italic.is_none() {
        p.italic = attr(e, b"i").map(|value| value == "1");
    }
    if p.underline.is_none() {
        p.underline = attr(e, b"u").map(|value| value != "none");
    }
}

fn overwrite_text_properties(p: &mut Pending, e: &quick_xml::events::BytesStart) {
    if let Some(value) = attr(e, b"sz")
        .and_then(|value| value.parse::<f64>().ok())
        .map(|size| (size / 100.0 * 1.3333 * 10.0).round() / 10.0)
    {
        p.font_size = Some(value);
    }
    if let Some(value) = attr(e, b"b") {
        p.bold = Some(value == "1");
    }
    if let Some(value) = attr(e, b"i") {
        p.italic = Some(value == "1");
    }
    if let Some(value) = attr(e, b"u") {
        p.underline = Some(value != "none");
    }
}

fn placeholder_keys(p: &Pending) -> Vec<String> {
    let mut keys = Vec::new();
    if let Some(idx) = &p.ph_idx {
        keys.push(format!("idx:{idx}"));
    }
    if let Some(kind) = &p.ph_type {
        keys.push(format!("type:{kind}"));
    }
    keys
}

fn placeholder_default<'a>(
    p: &Pending,
    defaults: &'a HashMap<String, Shape>,
) -> Option<&'a Shape> {
    p.ph_idx
        .as_ref()
        .and_then(|idx| defaults.get(&format!("idx:{idx}")))
        .or_else(|| {
            p.ph_type
                .as_ref()
                .and_then(|kind| defaults.get(&format!("type:{kind}")))
        })
}

fn parse_master_text_styles(
    xml: &str,
    scheme: &HashMap<String, String>,
    clr_map: &HashMap<String, String>,
) -> Result<HashMap<String, Shape>, String> {
    let empty_rels = HashMap::new();
    let empty_defaults = HashMap::new();
    let ctx = SlideCtx {
        scheme,
        clr_map,
        rels: &empty_rels,
        defaults: &empty_defaults,
    };
    let mut reader = Reader::from_str(xml);
    let mut stack = Vec::new();
    let mut current: Option<(&str, Pending)> = None;
    let mut defaults = HashMap::new();
    loop {
        let event = reader.read_event().map_err(|e| e.to_string())?;
        match event {
            Event::Start(ref e) | Event::Empty(ref e) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                let empty = matches!(event, Event::Empty(_));
                if current.is_none() {
                    let kind = match local.as_str() {
                        "titleStyle" => Some("title"),
                        "bodyStyle" => Some("body"),
                        "otherStyle" => Some("other"),
                        _ => None,
                    };
                    if let Some(kind) = kind {
                        current = Some((kind, Pending::default()));
                    }
                } else if let Some((_, pending)) = current.as_mut() {
                    handle_element(pending, &local, e, &stack, &ctx);
                }
                if !empty {
                    stack.push(local);
                }
            }
            Event::End(ref e) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                stack.pop();
                if matches!(local.as_str(), "titleStyle" | "bodyStyle" | "otherStyle") {
                    if let Some((kind, pending)) = current.take() {
                        let mut shape = Shape {
                            kind: "text".into(),
                            stroke: "none".into(),
                            ..Shape::default()
                        };
                        apply_text_properties(&mut shape, &pending);
                        let keys: &[&str] = match kind {
                            "title" => &["title", "ctrTitle"],
                            "body" => &["body", "subTitle", "obj"],
                            _ => &["ftr", "sldNum", "dt"],
                        };
                        for key in keys {
                            defaults.insert(format!("type:{key}"), shape.clone());
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(defaults)
}

fn apply_text_properties(shape: &mut Shape, p: &Pending) {
    if let Some(value) = p.font_size {
        shape.font_size = value;
    }
    if let Some(value) = &p.text_color {
        shape.text_color = value.clone();
    }
    if let Some(value) = &p.font_family {
        shape.font_family = value.clone();
    }
    if let Some(value) = p.bold {
        shape.bold = value;
    }
    if let Some(value) = p.italic {
        shape.italic = value;
    }
    if let Some(value) = p.underline {
        shape.underline = value;
    }
    if let Some(value) = &p.text_align {
        shape.text_align = value.clone();
    }
    if let Some(value) = &p.vertical_align {
        shape.vertical_align = value.clone();
    }
}

fn finish(p: Pending, ctx: &SlideCtx, default: Option<&Shape>) -> Option<Shape> {
    let mut shape = default.cloned().unwrap_or_default();
    shape.text.clear();
    shape.src.clear();
    shape.points.clear();

    if p.is_pic {
        let embed = p.svg_blip.as_ref().or(p.blip.as_ref())?;
        let (_, target) = ctx.rels.get(embed)?;
        shape.kind = "image".into();
        // Still the media part path here; read() swaps it for a data URL.
        shape.src = target.clone();
        shape.stroke = "none".into();
        shape.crop_left = p.crop_left;
        shape.crop_top = p.crop_top;
        shape.crop_right = p.crop_right;
        shape.crop_bottom = p.crop_bottom;
    }
    let is_line = p.is_cxn
        || matches!(
            p.prst.as_deref(),
            Some("line") | Some("straightConnector1")
        );

    if !p.is_pic && p.has_custgeom {
        shape.kind = "pen".into();
        shape.pen_arrow = p.arrow;
        shape.points = p
            .path_pts
            .iter()
            .map(|(x, y)| [px(p.x + x), px(p.y + y)])
            .collect();
        if shape.points.is_empty() {
            return None;
        }
    } else if !p.is_pic && is_line {
        shape.kind = if p.arrow { "arrow" } else { "line" }.into();
        // Stored as start -> end; flips say which corner of the box starts.
        shape.x = px(if p.flip_h { p.x + p.cx } else { p.x });
        shape.y = px(if p.flip_v { p.y + p.cy } else { p.y });
        shape.w = px(if p.flip_h { -p.cx } else { p.cx });
        shape.h = px(if p.flip_v { -p.cy } else { p.cy });
    } else if !p.is_pic {
        shape.kind = if p.tx_box || (!p.text.trim().is_empty() && p.stroke.is_none()) {
            "text".into()
        } else if p.prst.as_deref() == Some("ellipse") {
            "ellipse".into()
        } else {
            // Every other preset is drawn as its bounding rectangle rather
            // than dropped, so the slide stays editable.
            "rect".into()
        };
    }

    if p.saw_off && shape.kind != "line" && shape.kind != "arrow" {
        shape.x = px(p.x);
        shape.y = px(p.y);
    }
    if p.saw_ext && shape.kind != "line" && shape.kind != "arrow" {
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
    shape.rotation = p.rotation;
    let text = p.text.trim_end_matches('\n');
    if !text.is_empty() {
        shape.text = text.to_string();
        if let Some(sz) = p.font_size {
            shape.font_size = sz;
        }
        if let Some(color) = p.text_color {
            shape.text_color = color;
        }
        if let Some(family) = p.font_family {
            shape.font_family = family;
        }
        if let Some(value) = p.bold {
            shape.bold = value;
        }
        if let Some(value) = p.italic {
            shape.italic = value;
        }
        if let Some(value) = p.underline {
            shape.underline = value;
        }
        if let Some(value) = p.text_align {
            shape.text_align = value;
        }
        if let Some(value) = p.vertical_align {
            shape.vertical_align = value;
        }
    }
    Some(shape)
}

fn apply_group_transforms(shape: &mut Shape, groups: &[GroupTransform]) {
    for group in groups.iter().rev() {
        let sx = if group.child_cx == 0 {
            1.0
        } else {
            group.cx as f64 / group.child_cx as f64
        };
        let sy = if group.child_cy == 0 {
            1.0
        } else {
            group.cy as f64 / group.child_cy as f64
        };
        let map_x = |value: f64| px(group.x) + (value - px(group.child_x)) * sx;
        let map_y = |value: f64| px(group.y) + (value - px(group.child_y)) * sy;
        if shape.kind == "pen" {
            for point in &mut shape.points {
                point[0] = map_x(point[0]);
                point[1] = map_y(point[1]);
            }
        } else {
            shape.x = map_x(shape.x);
            shape.y = map_y(shape.y);
            shape.w *= sx;
            shape.h *= sy;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    // A 1x1 red PNG.
    const TINY_PNG: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
                            group_id: "diagram".into(),
                            ..Shape::default()
                        },
                        Shape {
                            kind: "ellipse".into(),
                            x: 500.0,
                            y: 200.0,
                            w: 180.0,
                            h: 180.0,
                            group_id: "diagram".into(),
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
                            font_family: "Times New Roman".into(),
                            bold: true,
                            italic: true,
                            underline: true,
                            text_align: "center".into(),
                            vertical_align: "bottom".into(),
                            stroke: "none".into(),
                            ..Shape::default()
                        },
                        Shape {
                            kind: "image".into(),
                            x: 640.0,
                            y: 40.0,
                            w: 320.0,
                            h: 180.0,
                            src: TINY_PNG.into(),
                            crop_left: 0.1,
                            crop_top: 0.2,
                            rotation: 15.0,
                            stroke: "none".into(),
                            ..Shape::default()
                        },
                    ],
                    background: "#212022".into(),
                },
                Slide {
                    shapes: vec![Shape {
                        kind: "pen".into(),
                        points: vec![[10.0, 20.0], [50.0, 60.0], [90.0, 30.0]],
                        stroke: "#862e9c".into(),
                        stroke_width: 4.0,
                        dash: "dot".into(),
                        pen_arrow: true,
                        ..Shape::default()
                    }],
                    ..Slide::default()
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
            assert_eq!(slide_a.background, slide_b.background);
            for (a, b) in slide_a.shapes.iter().zip(&slide_b.shapes) {
                assert_eq!(a.kind, b.kind);
                assert_eq!(a.stroke, b.stroke);
                assert_eq!(a.dash, b.dash);
                assert_eq!(a.fill, b.fill);
                assert_eq!(a.text, b.text);
                assert_eq!(a.group_id, b.group_id);
                assert!(close(a.stroke_width, b.stroke_width));
                if a.kind == "pen" {
                    assert_eq!(a.pen_arrow, b.pen_arrow);
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
                    assert_eq!(a.font_family, b.font_family);
                    assert_eq!(a.bold, b.bold);
                    assert_eq!(a.italic, b.italic);
                    assert_eq!(a.underline, b.underline);
                    assert_eq!(a.text_align, b.text_align);
                    assert_eq!(a.vertical_align, b.vertical_align);
                }
                if a.kind == "image" {
                    assert_eq!(a.src, b.src);
                    assert!(close(a.crop_left, b.crop_left));
                    assert!(close(a.crop_top, b.crop_top));
                    assert!(close(a.rotation, b.rotation));
                }
            }
        }
    }

    /// A minimal package shaped the way PowerPoint writes one: theme colors
    /// referenced by schemeClr, a placeholder that inherits its box from the
    /// layout, a picture, and an empty prompt placeholder to drop.
    #[test]
    fn imports_powerpoint_style_parts() {
        let theme = "<?xml version=\"1.0\"?>\
<a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">\
<a:themeElements><a:clrScheme name=\"t\">\
<a:dk1><a:sysClr val=\"windowText\" lastClr=\"111111\"/></a:dk1>\
<a:lt1><a:sysClr val=\"window\" lastClr=\"FFFFFF\"/></a:lt1>\
<a:dk2><a:srgbClr val=\"232F3E\"/></a:dk2><a:lt2><a:srgbClr val=\"F1F3F3\"/></a:lt2>\
<a:accent1><a:srgbClr val=\"ED7100\"/></a:accent1><a:accent2><a:srgbClr val=\"037F0C\"/></a:accent2>\
<a:accent3><a:srgbClr val=\"000000\"/></a:accent3><a:accent4><a:srgbClr val=\"000000\"/></a:accent4>\
<a:accent5><a:srgbClr val=\"000000\"/></a:accent5><a:accent6><a:srgbClr val=\"000000\"/></a:accent6>\
<a:hlink><a:srgbClr val=\"000000\"/></a:hlink><a:folHlink><a:srgbClr val=\"000000\"/></a:folHlink>\
</a:clrScheme></a:themeElements></a:theme>";
        let master = "<?xml version=\"1.0\"?>\
<p:sldMaster xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\
<p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Master band\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>\
<p:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"952500\" cy=\"476250\"/></a:xfrm>\
<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val=\"accent2\"/></a:solidFill></p:spPr></p:sp>\
</p:spTree></p:cSld>\
<p:clrMap bg1=\"dk1\" tx1=\"lt1\" bg2=\"dk2\" tx2=\"lt2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\"/>\
<p:txStyles><p:titleStyle><a:lvl1pPr algn=\"ctr\"><a:defRPr sz=\"3200\" b=\"1\">\
<a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"Arial\"/></a:defRPr></a:lvl1pPr></p:titleStyle>\
</p:txStyles></p:sldMaster>";
        let layout = "<?xml version=\"1.0\"?>\
<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"212022\"/></a:solidFill></p:bgPr></p:bg>\
<p:spTree><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title\"/><p:cNvSpPr/>\
<p:nvPr><p:ph type=\"title\" idx=\"4\"/></p:nvPr></p:nvSpPr>\
<p:spPr><a:xfrm><a:off x=\"952500\" y=\"476250\"/><a:ext cx=\"3810000\" cy=\"952500\"/></a:xfrm></p:spPr>\
</p:sp>\
<p:pic><p:nvPicPr><p:cNvPr id=\"3\" name=\"Layout logo\"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>\
<p:blipFill><a:blip r:embed=\"rId2\"/></p:blipFill><p:spPr><a:xfrm><a:off x=\"10477500\" y=\"476250\"/>\
<a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm><a:prstGeom prst=\"rect\"/></p:spPr></p:pic>\
</p:spTree></p:cSld></p:sldLayout>";
        let slide = "<?xml version=\"1.0\"?>\
<p:sld xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\
<p:cSld><p:spTree>\
<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"/><p:cNvSpPr/>\
<p:nvPr><p:ph type=\"title\" idx=\"4\"/></p:nvPr></p:nvSpPr><p:spPr/>\
<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang=\"en-US\"/><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>\
<p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Empty prompt\"/><p:cNvSpPr/>\
<p:nvPr><p:ph type=\"body\" idx=\"9\"/></p:nvPr></p:nvSpPr><p:spPr/>\
<p:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>\
<p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Band\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>\
<p:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"1905000\" cy=\"952500\"/></a:xfrm>\
<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom>\
<a:solidFill><a:schemeClr val=\"accent1\"><a:shade val=\"50000\"/></a:schemeClr></a:solidFill></p:spPr>\
<p:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>\
<p:pic><p:nvPicPr><p:cNvPr id=\"5\" name=\"Picture 4\"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>\
<p:blipFill><a:blip r:embed=\"rId2\"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>\
<p:spPr><a:xfrm><a:off x=\"952500\" y=\"1905000\"/><a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm>\
<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr></p:pic>\
</p:spTree></p:cSld></p:sld>";
        let slide_rels = "<?xml version=\"1.0\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/image1.png\"/>\
</Relationships>";
        let layout_rels = "<?xml version=\"1.0\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"../slideMasters/slideMaster2.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/image1.png\"/>\
</Relationships>";
        let master_rels = "<?xml version=\"1.0\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme\" Target=\"../theme/theme2.xml\"/>\
</Relationships>";
        let png = base64::engine::general_purpose::STANDARD
            .decode(TINY_PNG.split_once("base64,").unwrap().1)
            .unwrap();

        let mut buffer = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buffer);
            let opts = zip::write::SimpleFileOptions::default();
            for (name, body) in [
                ("ppt/theme/theme2.xml", theme.as_bytes()),
                ("ppt/slideMasters/slideMaster2.xml", master.as_bytes()),
                (
                    "ppt/slideMasters/_rels/slideMaster2.xml.rels",
                    master_rels.as_bytes(),
                ),
                ("ppt/slideLayouts/slideLayout1.xml", layout.as_bytes()),
                (
                    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
                    layout_rels.as_bytes(),
                ),
                ("ppt/slides/slide1.xml", slide.as_bytes()),
                ("ppt/slides/_rels/slide1.xml.rels", slide_rels.as_bytes()),
                ("ppt/media/image1.png", &png),
            ] {
                zip.start_file(name, opts).unwrap();
                zip.write_all(body).unwrap();
            }
            zip.finish().unwrap();
        }
        buffer.set_position(0);
        let deck = read(buffer).unwrap();
        let shapes = &deck.slides[0].shapes;

        // The layout's solid background is the slide's color, not a shape on
        // top of it.
        assert_eq!(deck.slides[0].background, "#212022");

        // The empty prompt placeholder is gone. Master artwork, layout logo
        // and slide-owned shapes keep their layer order.
        assert_eq!(shapes.len(), 5);

        let master_band = &shapes[0];
        assert_eq!(master_band.kind, "rect");
        assert_eq!(master_band.fill, "#037f0c");

        let layout_logo = &shapes[1];
        assert_eq!(layout_logo.kind, "image");
        assert_eq!(layout_logo.src, TINY_PNG);

        let title = &shapes[2];
        assert_eq!(title.kind, "text");
        // 952500 EMU = 100 px: the box came from the layout.
        assert!((title.x - 100.0).abs() < 0.5 && (title.y - 50.0).abs() < 0.5);
        assert!((title.w - 400.0).abs() < 0.5 && (title.h - 100.0).abs() < 0.5);
        assert_eq!(title.text_color, "#ffffff");
        assert!((title.font_size - 42.7).abs() < 0.1);
        assert_eq!(title.font_family, "Arial");
        assert!(title.bold);
        assert_eq!(title.text_align, "center");

        let band = &shapes[3];
        assert_eq!(band.kind, "rect");
        // accent1 ED7100 shaded to 50%.
        assert_eq!(band.fill, "#773900");

        let pic = &shapes[4];
        assert_eq!(pic.kind, "image");
        assert_eq!(pic.src, TINY_PNG);
        assert!((pic.x - 100.0).abs() < 0.5 && (pic.w - 100.0).abs() < 0.5);
    }

    #[test]
    fn imports_relationship_backed_background_images() {
        let xml = "<p:sldLayout xmlns:a=\"a\" xmlns:r=\"r\" xmlns:p=\"p\">\
<p:cSld><p:bg><p:bgPr><a:blipFill><a:blip r:embed=\"rId2\"/>\
</a:blipFill></p:bgPr></p:bg></p:cSld></p:sldLayout>";
        let rels = HashMap::from([(
            "rId2".into(),
            ("image".into(), "ppt/media/background.png".into()),
        )]);
        let scheme = HashMap::new();
        let clr_map = HashMap::new();
        let defaults = HashMap::new();
        let ctx = SlideCtx {
            scheme: &scheme,
            clr_map: &clr_map,
            rels: &rels,
            defaults: &defaults,
        };

        let background = parse_background(xml, &ctx, 1280.0, 720.0).unwrap();
        assert_eq!(background.kind, "image");
        assert_eq!(background.src, "ppt/media/background.png");
        assert_eq!((background.w, background.h), (1280.0, 720.0));
    }

    /// A slide part carries its background before its shape tree, and a white
    /// slide writes no background element at all.
    #[test]
    fn background_is_written_only_when_it_is_not_white() {
        let mut buffer = Cursor::new(Vec::new());
        write(&sample_deck(), &mut buffer).unwrap();
        buffer.set_position(0);
        let mut archive = zip::ZipArchive::new(buffer).unwrap();

        let colored = part(&mut archive, "ppt/slides/slide1.xml").unwrap();
        assert!(colored.contains("<p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"212022\"/>"));
        assert!(colored.find("<p:bg>").unwrap() < colored.find("<p:spTree>").unwrap());

        let white = part(&mut archive, "ppt/slides/slide2.xml").unwrap();
        assert!(!white.contains("<p:bg>"));
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

    /// Import and export must accept the same formats. When they drifted
    /// apart, a webp picture imported fine and then vanished on save.
    #[test]
    fn every_importable_picture_format_is_writable() {
        let types = content_types(1);
        for (ext, mime) in IMAGE_FORMATS {
            assert_eq!(mime_for_ext(ext), Some(mime), "{ext} not importable");
            let url = format!("data:{mime};base64,AAAA");
            assert_eq!(
                decode_data_url(&url).map(|(e, _)| e),
                Some(ext),
                "{mime} imports but does not export"
            );
            assert!(
                types.contains(&format!("Extension=\"{ext}\"")),
                "{ext} is missing from the content types"
            );
        }
        // .jpg parts are common and map onto the jpeg entry.
        assert_eq!(mime_for_ext("JPG"), Some("image/jpeg"));
        // Formats a webview cannot draw stay out of both directions.
        assert_eq!(mime_for_ext("tiff"), None);
        assert_eq!(decode_data_url("data:image/tiff;base64,AAAA"), None);
        assert_eq!(decode_data_url("https://example.com/a.png"), None);
    }

    #[test]
    fn foreign_slide_sizes_fit_the_canvas() {
        // A portrait 4:3 flipped on its side: 6858000 x 12192000 EMU.
        let sz = parse_sld_sz(
            "<p:presentation xmlns:p=\"x\"><p:sldSz cx=\"6858000\" cy=\"12192000\"/>\
<p:notesSz cx=\"1\" cy=\"1\"/></p:presentation>",
        )
        .unwrap();
        assert_eq!(sz, (6858000.0, 12192000.0));
        let scale = (SLIDE_W * EMU_PER_PX / sz.0).min(SLIDE_H * EMU_PER_PX / sz.1);
        // Height is the binding side: 720 / 1280 of the declared height.
        assert!((scale - 0.5625).abs() < 1e-9);

        let mut shape = Shape {
            kind: "pen".into(),
            x: 100.0,
            y: 200.0,
            w: 400.0,
            h: 80.0,
            points: vec![[100.0, 200.0]],
            font_size: 24.0,
            stroke_width: 2.0,
            ..Shape::default()
        };
        scale_shape(&mut shape, scale);
        assert_eq!(shape.x, 56.25);
        assert_eq!(shape.w, 225.0);
        assert_eq!(shape.points[0], [56.25, 112.5]);
        assert_eq!(shape.font_size, 13.5);
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
