//! PPTX package and DrawingML serialization.

use super::common::{emu, ext_for_mime, hex, xml_escape, ARROW_ENDS, IMAGE_FORMATS, NS};
use crate::{Deck, Shape, Slide};
use base64::Engine;
use std::collections::HashMap;
use std::io::{Seek, Write};

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
    add(
        "ppt/presentation.xml",
        presentation(n, deck.slide_width, deck.slide_height).as_bytes(),
    )?;
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
        let (xml, rels) = slide_xml(slide, &mut media, deck.slide_width, deck.slide_height);
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

pub(super) fn decode_data_url(src: &str) -> Option<(&'static str, Vec<u8>)> {
    let rest = src.strip_prefix("data:")?;
    let (mime, b64) = rest.split_once(";base64,")?;
    let ext = ext_for_mime(mime)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .ok()?;
    Some((ext, bytes))
}

pub(super) fn content_types(slides: usize) -> String {
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

fn presentation(slides: usize, width: f64, height: f64) -> String {
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
<p:sldSz cx=\"{}\" cy=\"{}\"/>\
<p:notesSz cx=\"6858000\" cy=\"9144000\"/>\
</p:presentation>",
        emu(width),
        emu(height)
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

fn slide_xml(
    slide: &Slide,
    media: &mut MediaStore,
    slide_width: f64,
    slide_height: f64,
) -> (String, String) {
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
                shapes.push_str(&group_xml(
                    next_id,
                    &shape.group_id,
                    slide_width,
                    slide_height,
                ));
                next_id += 1;
            }
            open_group = shape.group_id.clone();
        }
        // id 1 (tree) is taken; shape ids start at 2.
        let id = next_id;
        next_id += 1;
        if shape.kind == "image" || shape.kind == "code" {
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

fn group_xml(id: u64, name: &str, slide_width: f64, slide_height: f64) -> String {
    format!(
        "<p:grpSp><p:nvGrpSpPr><p:cNvPr id=\"{id}\" name=\"{}\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\
<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"{}\" cy=\"{}\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"{}\" cy=\"{}\"/></a:xfrm></p:grpSpPr>",
        xml_escape(name),
        emu(slide_width),
        emu(slide_height),
        emu(slide_width),
        emu(slide_height),
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
    let (name, description) = if shape.kind == "code" {
        let mut source = shape.clone();
        source.src.clear();
        let encoded = serde_json::to_vec(&source)
            .ok()
            .map(|json| base64::engine::general_purpose::STANDARD.encode(json))
            .unwrap_or_default();
        (format!("Code block {id}"), format!(" descr=\"akbun-code:{encoded}\""))
    } else {
        (format!("Picture {id}"), String::new())
    };
    format!(
        "<p:pic><p:nvPicPr><p:cNvPr id=\"{id}\" name=\"{name}\"{description}/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>\
<p:blipFill><a:blip r:embed=\"rId{rid}\"/>{crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>\
<p:spPr>{}<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom>{}</p:spPr></p:pic>",
        xfrm(shape.x, shape.y, shape.w, shape.h, false, false, shape.rotation),
        line_xml(shape),
    )
}

fn line_xml(shape: &Shape) -> String {
    let w = emu(shape.stroke_width).max(1);
    if shape.stroke == "none" {
        return format!("<a:ln w=\"{w}\"><a:noFill/></a:ln>");
    }
    let dash = match shape.dash.as_str() {
        "dash" => "<a:prstDash val=\"dash\"/>",
        "dot" => "<a:prstDash val=\"sysDot\"/>",
        _ => "",
    };
    // An unknown end name is written as no end at all.
    let ends = format!(
        "{}{}",
        end_xml("headEnd", &shape.arrow_start),
        end_xml("tailEnd", &shape.arrow_end)
    );
    format!(
        "<a:ln w=\"{w}\"><a:solidFill><a:srgbClr val=\"{}\"/></a:solidFill>{dash}{ends}</a:ln>",
        hex(&shape.stroke)
    )
}

fn end_xml(tag: &str, end: &str) -> String {
    if ARROW_ENDS.contains(&end) {
        format!("<a:{tag} type=\"{end}\"/>")
    } else {
        String::new()
    }
}

fn fill_xml(fill: &str) -> String {
    if fill == "none" {
        "<a:noFill/>".into()
    } else {
        format!("<a:solidFill><a:srgbClr val=\"{}\"/></a:solidFill>", hex(fill))
    }
}

/// pptx measures rotation in sixtieths of a degree about the centre of the
/// box, which is the same centre the editor rotates about.
fn rot_attr(rotation: f64) -> String {
    if rotation == 0.0 {
        String::new()
    } else {
        format!(" rot=\"{}\"", (rotation * 60000.0).round() as i64)
    }
}

fn xfrm(x: f64, y: f64, w: f64, h: f64, flip_h: bool, flip_v: bool, rotation: f64) -> String {
    let flips = format!(
        "{}{}",
        if flip_h { " flipH=\"1\"" } else { "" },
        if flip_v { " flipV=\"1\"" } else { "" }
    );
    format!(
        "<a:xfrm{}{flips}><a:off x=\"{}\" y=\"{}\"/><a:ext cx=\"{}\" cy=\"{}\"/></a:xfrm>",
        rot_attr(rotation),
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
    // A text box is nothing but its text, so it gets no inset. Text inside a
    // rect or an ellipse keeps the same 8px off the outline that the editor
    // draws it at, or the two disagree by that much on every round trip.
    let inset = if shape.kind == "text" {
        0
    } else {
        (8.0 * crate::EMU_PER_PX) as i64
    };
    format!(
        "<p:txBody><a:bodyPr wrap=\"square\" anchor=\"{anchor}\" lIns=\"{inset}\" tIns=\"{inset}\" rIns=\"{inset}\" bIns=\"{inset}\"><a:noAutofit/></a:bodyPr><a:lstStyle/>{paragraphs}</p:txBody>"
    )
}

fn shape_xml(shape: &Shape, id: u64) -> String {
    match shape.kind.as_str() {
        "line" | "arrow" => {
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
                xfrm(x, y, w, h, shape.w < 0.0, shape.h < 0.0, shape.rotation),
                line_xml(shape)
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
                xfrm(bx, by, bw, bh, false, false, shape.rotation),
                line_xml(shape)
            )
        }
        "text" => {
            format!(
                "<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"Text {id}\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/></p:nvSpPr>\
<p:spPr>{}<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>{}</p:sp>",
                xfrm(shape.x, shape.y, shape.w, shape.h, false, false, shape.rotation),
                text_body(shape)
            )
        }
        // rect and ellipse
        _ => {
            let prst = if shape.kind == "ellipse" { "ellipse" } else { "rect" };
            // Text written inside the outline goes in the shape's own txBody,
            // which is what PowerPoint puts there too, so it stays attached to
            // the shape instead of becoming a box sitting on top of it.
            let text = if shape.text.is_empty() {
                String::new()
            } else {
                text_body(shape)
            };
            format!(
                "<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"Shape {id}\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>\
<p:spPr>{}<a:prstGeom prst=\"{prst}\"><a:avLst/></a:prstGeom>{}{}</p:spPr>{text}</p:sp>",
                xfrm(shape.x, shape.y, shape.w, shape.h, false, false, shape.rotation),
                fill_xml(&shape.fill),
                line_xml(shape)
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
