//! Small XML helpers used by slide- and shape-level parsers.

pub(super) fn attr(
    element: &quick_xml::events::BytesStart,
    name: &[u8],
) -> Option<String> {
    element.attributes().flatten().find_map(|attribute| {
        if attribute.key.local_name().as_ref() == name {
            String::from_utf8(attribute.value.to_vec()).ok()
        } else {
            None
        }
    })
}

/// `#rrggbb` for exactly six ASCII hex digits, else None. Colours go straight
/// into SVG attributes on the page, so a value that is not hex is treated as
/// absent instead of being carried along as text.
pub(super) fn hex_color(value: &str) -> Option<String> {
    (value.len() == 6 && value.bytes().all(|b| b.is_ascii_hexdigit()))
        .then(|| format!("#{}", value.to_ascii_lowercase()))
}

/// For colours that arrive inside an embedded Shape JSON: `none` or 3, 4, 6
/// or 8 hex digits behind `#` (the forms the page's `safeColor` accepts).
pub(super) fn safe_color(value: &mut String, fallback: &str) {
    let ok = value == "none"
        || value.strip_prefix('#').is_some_and(|hex| {
            matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|b| b.is_ascii_hexdigit())
        });
    if !ok {
        *value = fallback.into();
    }
}

pub(super) fn in_ctx(stack: &[String], name: &str) -> bool {
    stack.iter().any(|item| item == name)
}

pub(super) fn mod_color(color: &str, op: &str, val: f64) -> String {
    let hex = color.trim_start_matches('#');
    if hex.len() != 6 {
        return color.into();
    }
    let channel = |index: usize| {
        u8::from_str_radix(&hex[index..index + 2], 16).unwrap_or(0) as f64
    };
    let apply = |value: f64| match op {
        "shade" | "lumMod" => value * val,
        "tint" => value * val + 255.0 * (1.0 - val),
        "lumOff" => value + 255.0 * val,
        _ => value,
    };
    let clamp = |value: f64| apply(value).round().clamp(0.0, 255.0) as u8;
    format!(
        "#{:02x}{:02x}{:02x}",
        clamp(channel(0)),
        clamp(channel(2)),
        clamp(channel(4))
    )
}
