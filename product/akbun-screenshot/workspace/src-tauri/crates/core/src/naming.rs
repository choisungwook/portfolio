use chrono::NaiveDateTime;

/// akbun-screenshot-2026-07-31-142530.png, in local time.
pub fn screenshot_filename(now: NaiveDateTime) -> String {
    format!("akbun-screenshot-{}.png", now.format("%Y-%m-%d-%H%M%S"))
}

/// akbun-screenshot-2026-07-31-142530-edited-20260731143012.png. The stamp goes
/// on the end of the name rather than replacing it, so a capture and the edit
/// made from it sort next to each other in the folder.
pub fn edited_filename(name: &str, now: NaiveDateTime) -> String {
    let stamp = now.format("%Y%m%d%H%M%S");
    // A leading dot is the whole name of a hidden file, not an extension.
    match name.rfind('.') {
        Some(dot) if dot > 0 => format!("{}-edited-{stamp}{}", &name[..dot], &name[dot..]),
        _ => format!("{name}-edited-{stamp}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn at(h: u32, m: u32, s: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 7, 31)
            .unwrap()
            .and_hms_opt(h, m, s)
            .unwrap()
    }

    #[test]
    fn screenshot_filename_formats_local_time() {
        assert_eq!(
            screenshot_filename(at(14, 25, 30)),
            "akbun-screenshot-2026-07-31-142530.png"
        );
    }

    // The stamp goes before the extension, otherwise the save dialog offers a
    // name the system does not treat as a png.
    #[test]
    fn edited_filename_keeps_the_extension_last() {
        assert_eq!(
            edited_filename("akbun-screenshot-2026-07-31-142530.png", at(14, 30, 12)),
            "akbun-screenshot-2026-07-31-142530-edited-20260731143012.png"
        );
    }

    #[test]
    fn edited_filename_without_extension_or_hidden_file() {
        assert_eq!(
            edited_filename("shot", at(14, 30, 12)),
            "shot-edited-20260731143012"
        );
        assert_eq!(
            edited_filename(".png", at(14, 30, 12)),
            ".png-edited-20260731143012"
        );
    }
}
