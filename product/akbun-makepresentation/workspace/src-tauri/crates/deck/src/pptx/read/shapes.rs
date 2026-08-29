//! DrawingML shape, text, placeholder, and group parsing.

use super::super::common::{px, read_arrow_end};
use super::xml::{attr, in_ctx, mod_color};
use super::{ParsedPart, SlideCtx};
use crate::{Shape, EMU_PER_PX};
use base64::Engine;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::HashMap;

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
    stroke_declared: bool,
    stroke: Option<String>,
    stroke_none: bool,
    stroke_w: Option<i64>,
    dash: Option<String>,
    /// True when either end names something, which is what tells a plain line
    /// from an arrow.
    has_end: bool,
    head_end: Option<String>,
    tail_end: Option<String>,
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
    code_shape: Option<Shape>,
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

pub(in crate::pptx) fn parse_part(
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
                                    || shape.kind == "code"
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

fn handle_element(
    p: &mut Pending,
    local: &str,
    e: &quick_xml::events::BytesStart,
    stack: &[String],
    ctx: &SlideCtx,
) {
    let get = |name: &[u8]| attr(e, name);
    match local {
        "cNvPr" if p.is_pic => {
            p.code_shape = get(b"descr")
                .and_then(|description| description.strip_prefix("akbun-code:").map(str::to_string))
                .and_then(|encoded| base64::engine::general_purpose::STANDARD.decode(encoded).ok())
                .and_then(|json| serde_json::from_slice::<Shape>(&json).ok());
        }
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
        "ln" if in_ctx(stack, "spPr") => {
            p.stroke_declared = true;
            p.stroke_w = get(b"w").and_then(|v| v.parse().ok());
        }
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
            let end = get(b"type");
            if end.as_deref().map(|t| t != "none").unwrap_or(false) {
                p.has_end = true;
            }
            if local == "headEnd" {
                p.head_end = end;
            } else {
                p.tail_end = end;
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

pub(super) fn parse_master_text_styles(
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
    let code_shape = p.code_shape.clone();
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
        // A freehand stroke names its two ends the same way a line does.
        shape.arrow_start = read_arrow_end(&p.head_end);
        shape.arrow_end = read_arrow_end(&p.tail_end);
        shape.points = p
            .path_pts
            .iter()
            .map(|(x, y)| [px(p.x + x), px(p.y + y)])
            .collect();
        if shape.points.is_empty() {
            return None;
        }
    } else if !p.is_pic && is_line {
        shape.kind = if p.has_end { "arrow" } else { "line" }.into();
        // headEnd sits at the start of the geometry and tailEnd at its end.
        // The flips below move the start point, not which end is which.
        shape.arrow_start = read_arrow_end(&p.head_end);
        shape.arrow_end = read_arrow_end(&p.tail_end);
        // Stored as start -> end; flips say which corner of the box starts.
        shape.x = px(if p.flip_h { p.x + p.cx } else { p.x });
        shape.y = px(if p.flip_v { p.y + p.cy } else { p.y });
        shape.w = px(if p.flip_h { -p.cx } else { p.cx });
        shape.h = px(if p.flip_v { -p.cy } else { p.cy });
    } else if !p.is_pic {
        // Text alone on the slide is a text box. Text on something that also
        // draws an outline or a fill is that shape's own text, now that a rect
        // and an ellipse can carry text of their own.
        let has_no_fill = p.fill.as_deref().is_none_or(|fill| fill == "none");
        let has_no_stroke = p.stroke.is_none();
        shape.kind = if p.tx_box
            || (!p.text.trim().is_empty() && has_no_stroke && has_no_fill)
        {
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
    } else if p.stroke_declared || shape.kind == "text" {
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
    // Text written inside a rect or an ellipse belongs in the middle of it,
    // which is where this editor puts it when the shape is drawn here. A file
    // that names no algn or anchor used to come back anchored top left, so the
    // next line typed into that shape landed somewhere the same shape drawn
    // here never would.
    if shape.kind == "rect" || shape.kind == "ellipse" {
        if p.text_align.is_none() {
            shape.text_align = "center".into();
        }
        if p.vertical_align.is_none() {
            shape.vertical_align = "center".into();
        }
    }
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
    if let Some(mut code) = code_shape {
        code.kind = "code".into();
        code.x = shape.x;
        code.y = shape.y;
        code.w = shape.w;
        code.h = shape.h;
        code.rotation = shape.rotation;
        code.src = shape.src;
        return Some(code);
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
