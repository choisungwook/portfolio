use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimedText {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    pub start_ms: u64,
    pub end_ms: u64,
}

impl TimeRange {
    pub fn duration_ms(self) -> u64 {
        self.end_ms.saturating_sub(self.start_ms)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioChunk {
    pub start_ms: u64,
    pub end_ms: u64,
}

impl AudioChunk {
    pub fn duration_ms(self) -> u64 {
        self.end_ms.saturating_sub(self.start_ms)
    }
}

fn seconds_ms(value: &Value) -> Option<u64> {
    value
        .as_f64()
        .filter(|number| number.is_finite() && *number >= 0.0)
        .map(|number| (number * 1000.0).round() as u64)
}

fn offset_ms(value: &Value) -> Option<u64> {
    let text = value.as_str()?.strip_suffix('s')?;
    text.parse::<f64>()
        .ok()
        .filter(|number| number.is_finite() && *number >= 0.0)
        .map(|number| (number * 1000.0).round() as u64)
}

fn timed_text(start_ms: u64, end_ms: u64, text: &str, chunk_offset_ms: u64) -> Option<TimedText> {
    let text = text.trim();
    if text.is_empty() || end_ms <= start_ms {
        return None;
    }
    Some(TimedText {
        start_ms: start_ms.saturating_add(chunk_offset_ms),
        end_ms: end_ms.saturating_add(chunk_offset_ms),
        text: text.to_string(),
    })
}

pub fn parse_openai(body: &str, chunk_offset_ms: u64) -> Result<Vec<TimedText>, String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|error| format!("the transcription response is not JSON: {error}"))?;
    let segments = value
        .get("segments")
        .and_then(Value::as_array)
        .ok_or("the transcription model did not return timestamped segments")?;
    let parsed = segments
        .iter()
        .filter_map(|segment| {
            timed_text(
                seconds_ms(segment.get("start")?)?,
                seconds_ms(segment.get("end")?)?,
                segment.get("text")?.as_str()?,
                chunk_offset_ms,
            )
        })
        .collect::<Vec<_>>();
    if parsed.is_empty() {
        return Err("the transcription model returned no timestamped speech".into());
    }
    Ok(parsed)
}

pub fn parse_azure(body: &str, chunk_offset_ms: u64) -> Result<Vec<TimedText>, String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|error| format!("the Azure transcription response is not JSON: {error}"))?;
    let phrases = value
        .get("phrases")
        .and_then(Value::as_array)
        .ok_or("Azure did not return timestamped phrases")?;
    let parsed = phrases
        .iter()
        .filter_map(|phrase| {
            let start = phrase.get("offsetMilliseconds")?.as_u64()?;
            let duration = phrase.get("durationMilliseconds")?.as_u64()?;
            timed_text(
                start,
                start.saturating_add(duration),
                phrase.get("text")?.as_str()?,
                chunk_offset_ms,
            )
        })
        .collect::<Vec<_>>();
    if parsed.is_empty() {
        return Err("Azure returned no timestamped speech".into());
    }
    Ok(parsed)
}

pub fn parse_google(body: &str, chunk_offset_ms: u64) -> Result<Vec<TimedText>, String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|error| format!("the Google transcription response is not JSON: {error}"))?;
    let results = value
        .get("results")
        .and_then(Value::as_array)
        .ok_or("Google did not return recognition results")?;
    let mut cursor = 0;
    let mut parsed = Vec::new();
    for result in results {
        let Some(alternative) = result
            .get("alternatives")
            .and_then(Value::as_array)
            .and_then(|items| items.first())
        else {
            continue;
        };
        let words = alternative.get("words").and_then(Value::as_array);
        let start = words
            .and_then(|items| items.first())
            .and_then(|word| word.get("startOffset"))
            .and_then(offset_ms)
            .unwrap_or(cursor);
        let end = words
            .and_then(|items| items.last())
            .and_then(|word| word.get("endOffset"))
            .and_then(offset_ms)
            .or_else(|| result.get("resultEndOffset").and_then(offset_ms))
            .unwrap_or_else(|| start.saturating_add(2000));
        cursor = end;
        if let Some(segment) = timed_text(
            start,
            end,
            alternative
                .get("transcript")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            chunk_offset_ms,
        ) {
            parsed.push(segment);
        }
    }
    if parsed.is_empty() {
        return Err("Google returned no timestamped speech".into());
    }
    Ok(parsed)
}

fn number_after(line: &str, marker: &str) -> Option<f64> {
    let tail = line.split_once(marker)?.1.trim_start();
    tail.split_whitespace().next()?.parse().ok()
}

pub fn parse_silence(log: &str, total_ms: u64, minimum_ms: u64, padding_ms: u64) -> Vec<TimeRange> {
    let mut ranges = Vec::new();
    let mut open = None;
    for line in log.lines() {
        if let Some(seconds) = number_after(line, "silence_start:") {
            open = Some((seconds.max(0.0) * 1000.0).round() as u64);
        }
        if let Some(seconds) = number_after(line, "silence_end:") {
            let Some(start) = open.take() else { continue };
            let end = ((seconds.max(0.0) * 1000.0).round() as u64).min(total_ms);
            push_silence(&mut ranges, start, end, minimum_ms, padding_ms);
        }
    }
    if let Some(start) = open {
        push_silence(&mut ranges, start, total_ms, minimum_ms, padding_ms);
    }
    ranges
}

fn push_silence(
    ranges: &mut Vec<TimeRange>,
    start_ms: u64,
    end_ms: u64,
    minimum_ms: u64,
    padding_ms: u64,
) {
    if end_ms.saturating_sub(start_ms) < minimum_ms {
        return;
    }
    let start_ms = start_ms.saturating_add(padding_ms);
    let end_ms = end_ms.saturating_sub(padding_ms);
    if end_ms > start_ms {
        ranges.push(TimeRange { start_ms, end_ms });
    }
}

pub fn plan_chunks(
    duration_ms: u64,
    maximum_ms: u64,
    overlap_ms: u64,
    silence: &[TimeRange],
) -> Vec<AudioChunk> {
    if duration_ms == 0 {
        return Vec::new();
    }
    if duration_ms <= maximum_ms || maximum_ms <= overlap_ms.saturating_mul(2) {
        return vec![AudioChunk {
            start_ms: 0,
            end_ms: duration_ms,
        }];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while duration_ms.saturating_sub(start) > maximum_ms {
        let target = start.saturating_add(maximum_ms.saturating_sub(overlap_ms));
        let earliest = start.saturating_add(maximum_ms / 2);
        let boundary = silence
            .iter()
            .map(|range| range.start_ms.saturating_add(range.duration_ms() / 2))
            .filter(|point| *point > earliest && *point < duration_ms)
            .min_by_key(|point| point.abs_diff(target))
            .filter(|point| point.abs_diff(target) <= maximum_ms / 4)
            .unwrap_or(target);
        let end = boundary.saturating_add(overlap_ms).min(duration_ms);
        chunks.push(AudioChunk {
            start_ms: start,
            end_ms: end,
        });
        let next = boundary.saturating_sub(overlap_ms);
        if next <= start {
            break;
        }
        start = next;
    }
    if start < duration_ms {
        chunks.push(AudioChunk {
            start_ms: start,
            end_ms: duration_ms,
        });
    }
    chunks
}

pub fn deduplicate_segments(mut segments: Vec<TimedText>) -> Vec<TimedText> {
    segments.sort_by_key(|segment| (segment.start_ms, segment.end_ms));
    let mut answer: Vec<TimedText> = Vec::new();
    for mut segment in segments {
        if let Some(previous) = answer.last() {
            if previous
                .text
                .trim()
                .eq_ignore_ascii_case(segment.text.trim())
                && segment.start_ms <= previous.end_ms
            {
                continue;
            }
            if segment.start_ms < previous.end_ms {
                segment.start_ms = previous.end_ms;
            }
        }
        if segment.end_ms > segment.start_ms {
            answer.push(segment);
        }
    }
    answer
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openai_segments_become_provider_neutral_milliseconds() {
        let parsed = parse_openai(
            r#"{"segments":[{"start":1.25,"end":2.5,"text":" hello "}]}"#,
            5000,
        )
        .unwrap();
        assert_eq!(
            parsed,
            vec![TimedText {
                start_ms: 6250,
                end_ms: 7500,
                text: "hello".into(),
            }]
        );
    }

    #[test]
    fn azure_and_google_responses_share_the_same_shape() {
        let azure = parse_azure(
            r#"{"phrases":[{"offsetMilliseconds":40,"durationMilliseconds":320,"text":"Weather"}]}"#,
            0,
        )
        .unwrap();
        let google = parse_google(
            r#"{"results":[{"alternatives":[{"transcript":"Weather","words":[{"startOffset":"0.040s","endOffset":"0.360s"}]}]}]}"#,
            0,
        )
        .unwrap();
        assert_eq!(azure, google);
    }

    #[test]
    fn silence_padding_keeps_the_edges_of_speech() {
        let log = "silence_start: 1.0\nsilence_end: 2.0 | silence_duration: 1.0\n";
        assert_eq!(
            parse_silence(log, 3000, 450, 120),
            vec![TimeRange {
                start_ms: 1120,
                end_ms: 1880,
            }]
        );
    }

    #[test]
    fn a_trailing_silence_is_closed_by_the_timeline_duration() {
        assert_eq!(
            parse_silence("silence_start: 8.0", 10_000, 450, 100),
            vec![TimeRange {
                start_ms: 8100,
                end_ms: 9900,
            }]
        );
    }

    #[test]
    fn long_audio_chunks_near_a_silent_boundary_with_overlap() {
        let chunks = plan_chunks(
            130_000,
            60_000,
            500,
            &[TimeRange {
                start_ms: 58_000,
                end_ms: 59_000,
            }],
        );
        assert_eq!(
            chunks[0],
            AudioChunk {
                start_ms: 0,
                end_ms: 59_000
            }
        );
        assert_eq!(chunks[1].start_ms, 58_000);
        assert!(chunks.iter().all(|chunk| chunk.duration_ms() <= 60_000));
        assert_eq!(chunks.last().unwrap().end_ms, 130_000);
    }

    #[test]
    fn overlap_duplicates_are_removed() {
        let segments = deduplicate_segments(vec![
            TimedText {
                start_ms: 0,
                end_ms: 1000,
                text: "same".into(),
            },
            TimedText {
                start_ms: 900,
                end_ms: 1500,
                text: "same".into(),
            },
        ]);
        assert_eq!(segments.len(), 1);
    }
}
