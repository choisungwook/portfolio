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

/// Word timestamps from an OpenAI-compatible verbose JSON response.
///
/// Reads the top-level `words` list (OpenAI), then per-segment `words` (the
/// shape local whisper servers return). A server that only gives segments gets
/// its words spread across the segment by length, which is close enough to cut
/// a filler at a pause and is why the review step exists.
pub fn parse_openai_words(body: &str, chunk_offset_ms: u64) -> Result<Vec<TimedText>, String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|error| format!("the transcription response is not JSON: {error}"))?;
    let word = |item: &Value| {
        timed_text(
            seconds_ms(item.get("start")?)?,
            seconds_ms(item.get("end")?)?,
            item.get("word").or_else(|| item.get("text"))?.as_str()?,
            chunk_offset_ms,
        )
    };
    if let Some(words) = value.get("words").and_then(Value::as_array) {
        let parsed: Vec<_> = words.iter().filter_map(word).collect();
        if !parsed.is_empty() {
            return Ok(parsed);
        }
    }
    let nested: Vec<_> = value
        .get("segments")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|segment| segment.get("words").and_then(Value::as_array).into_iter().flatten())
        .filter_map(word)
        .collect();
    if !nested.is_empty() {
        return Ok(nested);
    }
    let spread: Vec<_> = parse_openai(body, chunk_offset_ms)?
        .iter()
        .flat_map(spread_words)
        .collect();
    Ok(spread)
}

fn spread_words(segment: &TimedText) -> Vec<TimedText> {
    let words: Vec<&str> = segment.text.split_whitespace().collect();
    let total: usize = words.iter().map(|word| word.chars().count()).sum();
    let span = segment.end_ms - segment.start_ms;
    let mut used = 0;
    words
        .iter()
        .map(|word| {
            let start = segment.start_ms + span * used as u64 / total.max(1) as u64;
            used += word.chars().count();
            let end = segment.start_ms + span * used as u64 / total.max(1) as u64;
            TimedText {
                start_ms: start,
                end_ms: end.max(start + 1),
                text: (*word).to_string(),
            }
        })
        .collect()
}

/// The request a local chat model gets for one batch of words.
pub fn filler_prompt(words: &[TimedText], first_index: usize) -> String {
    let mut prompt = String::from(
        "Below is a transcript, one word per line as index<TAB>word. Pick the words to cut \
         from the video: filler words and hesitation sounds (um, uh, 어, 음, 그, 저기), \
         stutters, repeated words, and false starts that the speaker abandons and restates. \
         Keep every word that carries meaning. Reply with JSON only, giving each index with \
         its word copied exactly, like {\"remove\":[{\"i\":3,\"word\":\"um\"}]}. \
         Reply {\"remove\":[]} if nothing should be cut.\n\n",
    );
    for (offset, word) in words.iter().enumerate() {
        prompt.push_str(&format!("{}\t{}\n", first_index + offset, word.text));
    }
    prompt
}

/// The word indices a chat model chose, from a reply that may wrap the JSON in
/// prose, code fences or a reasoning block. `batch` is the words the prompt
/// listed, starting at index `first`.
///
/// Small models miscount, so a pick that names its word is kept only if that
/// word is at the index or right next to it, and moved there. A bare index is
/// kept if it is inside the batch.
pub fn parse_filler_picks(reply: &str, batch: &[TimedText], first: usize) -> Result<Vec<usize>, String> {
    let count = batch.len();
    let normal = |text: &str| {
        text.trim_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase()
    };
    let resolve = |item: &Value| -> Option<usize> {
        if let Some(index) = item.as_u64() {
            return Some(index as usize).filter(|index| (first..first + count).contains(index));
        }
        let index = item.get("i").and_then(Value::as_u64)? as usize;
        let word = normal(item.get("word")?.as_str()?);
        [index, index + 1, index.wrapping_sub(1)].into_iter().find(|candidate| {
            candidate
                .checked_sub(first)
                .and_then(|offset| batch.get(offset))
                .is_some_and(|actual| normal(&actual.text) == word)
        })
    };
    let starts: Vec<usize> = reply.match_indices('{').map(|(index, _)| index).collect();
    let ends: Vec<usize> = reply.match_indices('}').map(|(index, _)| index).collect();
    for &start in starts.iter().rev() {
        for &end in ends.iter().filter(|end| **end > start) {
            let Ok(value) = serde_json::from_str::<Value>(&reply[start..=end]) else {
                continue;
            };
            let Some(list) = value.get("remove").and_then(Value::as_array) else {
                continue;
            };
            let mut picks: Vec<usize> = list.iter().filter_map(resolve).collect();
            picks.sort_unstable();
            picks.dedup();
            return Ok(picks);
        }
    }
    Err("the language model did not reply with a remove list".into())
}

/// Picked words as ranges to cut. Neighbouring picks become one range so a
/// false start is removed in one piece rather than leaving slivers between its
/// words.
pub fn filler_ranges(words: &[TimedText], picks: &[usize]) -> Vec<TimedText> {
    let mut ranges: Vec<TimedText> = Vec::new();
    let mut previous = None;
    for &index in picks {
        let Some(word) = words.get(index) else { continue };
        match ranges.last_mut() {
            Some(last) if previous == Some(index.wrapping_sub(1)) => {
                last.end_ms = word.end_ms.max(last.end_ms);
                last.text.push(' ');
                last.text.push_str(&word.text);
            }
            _ => ranges.push(word.clone()),
        }
        previous = Some(index);
    }
    ranges
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
    fn word_timestamps_come_from_any_of_the_three_shapes() {
        let top = parse_openai_words(
            r#"{"words":[{"word":"um","start":0.1,"end":0.3},{"word":"hi","start":0.4,"end":0.6}]}"#,
            1000,
        )
        .unwrap();
        assert_eq!((top[0].start_ms, top[0].end_ms, top[1].text.as_str()), (1100, 1300, "hi"));
        let nested = parse_openai_words(
            r#"{"segments":[{"start":0,"end":1,"text":"um hi","words":[{"word":" um","start":0.1,"end":0.3}]}]}"#,
            0,
        )
        .unwrap();
        assert_eq!(nested.len(), 1);
        assert_eq!(nested[0].text, "um");
        let spread =
            parse_openai_words(r#"{"segments":[{"start":0,"end":1,"text":"aa bb"}]}"#, 0).unwrap();
        assert_eq!(
            spread.iter().map(|w| (w.start_ms, w.end_ms)).collect::<Vec<_>>(),
            vec![(0, 500), (500, 1000)]
        );
    }

    #[test]
    fn model_picks_are_found_inside_prose_and_kept_in_range() {
        let word = |text: &str| TimedText {
            start_ms: 0,
            end_ms: 1,
            text: text.into(),
        };
        let batch: Vec<_> = ["So", "um", "I", "uh,", "go"].into_iter().map(word).collect();
        let reply = "<think>maybe {not json}</think>\n```json\n{\"remove\": [12, 10, 10, 99, 3]}\n```";
        assert_eq!(parse_filler_picks(reply, &batch, 10).unwrap(), vec![10, 12]);
        // Off by one is moved onto the named word; a word that is nowhere near is dropped.
        let named = r#"{"remove":[{"i":12,"word":"um"},{"i":13,"word":"uh"},{"i":10,"word":"banana"}]}"#;
        assert_eq!(parse_filler_picks(named, &batch, 10).unwrap(), vec![11, 13]);
        assert!(parse_filler_picks("no idea", &batch, 0).is_err());
    }

    #[test]
    fn neighbouring_picks_become_one_cut() {
        let word = |start_ms, text: &str| TimedText {
            start_ms,
            end_ms: start_ms + 100,
            text: text.into(),
        };
        let words = vec![word(0, "I"), word(100, "I"), word(200, "um"), word(300, "go"), word(400, "uh")];
        let ranges = filler_ranges(&words, &[1, 2, 4, 9]);
        assert_eq!(ranges.len(), 2);
        assert_eq!((ranges[0].start_ms, ranges[0].end_ms, ranges[0].text.as_str()), (100, 300, "I um"));
        assert_eq!(ranges[1].text, "uh");
        assert!(filler_prompt(&words[..2], 7).contains("7\tI\n8\tI\n"));
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
