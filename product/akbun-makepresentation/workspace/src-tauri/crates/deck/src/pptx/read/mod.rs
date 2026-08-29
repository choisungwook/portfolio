//! PPTX package traversal, relationships, themes, and slide assembly.

mod shapes;
mod xml;

use super::common::mime_for_ext;
use crate::{Deck, Shape, Slide, EMU_PER_PX, SLIDE_H, SLIDE_W};
use base64::Engine;
use quick_xml::events::Event;
use quick_xml::Reader;
use shapes::parse_master_text_styles;
pub(super) use shapes::parse_part;
use std::collections::HashMap;
use std::io::{Read, Seek};
use xml::{attr, in_ctx, mod_color};

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

    // The page and shapes use the same pixel-to-EMU scale, so imported decks
    // keep their original dimensions without remapping shape coordinates.
    let sld_sz = part(&mut archive, "ppt/presentation.xml").and_then(|xml| parse_sld_sz(&xml));
    let (page_w, page_h) = sld_sz
        .map(|(cx, cy)| (cx / EMU_PER_PX, cy / EMU_PER_PX))
        .unwrap_or((SLIDE_W, SLIDE_H));

    let mut media_cache: HashMap<String, String> = HashMap::new();

    let mut deck = Deck {
        slide_width: page_w,
        slide_height: page_h,
        ..Deck::default()
    };
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
            if shape.kind == "image" || shape.kind == "code" {
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
            if shapes[i].kind == "image" || shapes[i].kind == "code" {
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

    Ok(deck)
}

pub(super) fn parse_sld_sz(xml: &str) -> Option<(f64, f64)> {
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

/// One zip entry as text, or None when missing or unreadable.
pub(super) fn part<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    name: &str,
) -> Option<String> {
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
pub(super) struct SlideCtx<'a> {
    /// clrScheme name -> "RRGGBB".
    pub(super) scheme: &'a HashMap<String, String>,
    /// clrMap alias -> clrScheme name, e.g. bg1 -> lt1.
    pub(super) clr_map: &'a HashMap<String, String>,
    /// rId -> (relationship type, normalized target path).
    pub(super) rels: &'a HashMap<String, (String, String)>,
    /// Placeholder key -> inherited box and text style.
    pub(super) defaults: &'a HashMap<String, Shape>,
}

impl SlideCtx<'_> {
    fn scheme_hex(&self, name: &str) -> Option<String> {
        scheme_hex(self.scheme, self.clr_map, name)
    }
}

#[derive(Default)]
pub(super) struct ParsedPart {
    pub(super) visible: Vec<Shape>,
    pub(super) placeholders: HashMap<String, Shape>,
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
pub(super) fn parse_background(
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
