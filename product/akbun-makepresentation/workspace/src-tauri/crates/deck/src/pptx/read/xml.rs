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
