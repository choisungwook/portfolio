use super::*;

pub(crate) fn srt_frame(value: &str, rate: Rate) -> Result<i64, String> {
    let parts: Vec<_> = value
        .trim()
        .replace(',', ".")
        .split(':')
        .map(str::to_string)
        .collect();
    if parts.len() != 3 {
        return Err(format!("invalid SRT time: {value}"));
    }
    let seconds: f64 = parts[0]
        .parse::<f64>()
        .map_err(|_| format!("invalid SRT time: {value}"))?
        * 3600.0
        + parts[1]
            .parse::<f64>()
            .map_err(|_| format!("invalid SRT time: {value}"))?
            * 60.0
        + parts[2]
            .parse::<f64>()
            .map_err(|_| format!("invalid SRT time: {value}"))?;
    Ok((seconds * rate.as_f64()).round().max(0.0) as i64)
}

pub(crate) fn srt_timestamp(frame: i64, rate: Rate) -> String {
    let millis = ((frame.max(0) as f64 / rate.as_f64()) * 1000.0).round() as u64;
    format!(
        "{:02}:{:02}:{:02},{:03}",
        millis / 3_600_000,
        (millis / 60_000) % 60,
        (millis / 1_000) % 60,
        millis % 1_000
    )
}

pub(crate) fn srt_cues(text: &str, rate: Rate) -> Result<Vec<(i64, i64, String)>, String> {
    let mut cues = Vec::new();
    for block in text.replace("\r\n", "\n").split("\n\n") {
        let lines: Vec<_> = block
            .lines()
            .filter(|line| !line.trim().is_empty())
            .collect();
        let Some(timing) = lines.iter().find(|line| line.contains(" --> ")) else {
            continue;
        };
        let Some((start, end)) = timing.split_once(" --> ") else {
            continue;
        };
        let start = srt_frame(start, rate)?;
        let end = srt_frame(end, rate)?;
        let text = lines
            .iter()
            .skip_while(|line| **line != *timing)
            .skip(1)
            .copied()
            .collect::<Vec<_>>()
            .join("\n");
        if end > start && !text.is_empty() {
            cues.push((start, end, text));
        }
    }
    Ok(cues)
}

pub(crate) fn srt_contents(mut cues: Vec<(i64, i64, &str)>, rate: Rate) -> String {
    cues.sort_by_key(|(start, _, _)| *start);
    cues.into_iter()
        .enumerate()
        .map(|(index, (start, end, text))| {
            format!(
                "{}\n{} --> {}\n{}\n\n",
                index + 1,
                srt_timestamp(start, rate),
                srt_timestamp(end, rate),
                text
            )
        })
        .collect()
}

#[tauri::command]
pub fn import_srt(
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
    track_id: String,
    path: String,
) -> Result<DocumentState, String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    let text =
        std::fs::read_to_string(&path).map_err(|error| format!("cannot read {path}: {error}"))?;
    let mut document = state.document.lock().unwrap();
    let rate = document.project().rate();
    let track = document
        .project()
        .track(&track_id)
        .ok_or("subtitle track is not on the timeline")?;
    if track.kind != TrackKind::Subtitle {
        return Err("choose a subtitle track before importing SRT".into());
    }
    let mut commands = Vec::new();
    for (start, end, text) in srt_cues(&text, rate)? {
        commands.push(Edit::AddVisualItem {
            track_id: track_id.clone(),
            content: VisualContent::Text {
                text,
                style: TextStyle::default(),
            },
            start,
            duration: end - start,
            transform: VisualTransform {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
                rotation: 0.0,
                opacity: 1.0,
            },
            z_index: 0,
            id: None,
        });
    }
    document.apply_all(commands)?;
    Ok(document.state())
}

#[tauri::command]
pub fn export_srt(state: State<AppState>, track_id: String, path: String) -> Result<(), String> {
    let document = state.document.lock().unwrap();
    let track = document
        .project()
        .track(&track_id)
        .ok_or("subtitle track is not on the timeline")?;
    if track.kind != TrackKind::Subtitle {
        return Err("choose a subtitle track before exporting SRT".into());
    }
    let cues = track
        .visual_items
        .iter()
        .filter_map(|item| {
            let VisualContent::Text { text, .. } = &item.content else {
                return None;
            };
            Some((item.start, item.end_frame(), text.as_str()))
        })
        .collect();
    let output = srt_contents(cues, document.project().rate());
    std::fs::write(&path, output).map_err(|error| format!("cannot write {path}: {error}"))
}
