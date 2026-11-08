use super::*;

/// Words per chat request. Small local models lose track of indices in long
/// lists, and a batch boundary only risks missing a false start that spans it.
pub(crate) const FILLER_BATCH: usize = 300;

#[allow(clippy::too_many_arguments)]
pub(crate) fn run_filler_job(
    app: &AppHandle,
    shared: &Arc<Mutex<RuntimeState>>,
    id: u64,
    cancel: &AtomicBool,
    ffmpeg: &str,
    settings: &Settings,
    credential: Option<&str>,
    project: makevideo_edit::Project,
    revision: u64,
) -> Result<AiEditResult, String> {
    let words = transcribe(
        app, shared, id, cancel, ffmpeg, settings, credential, &project, true,
    )?;
    if words.is_empty() {
        return Err("the transcription contained no words".into());
    }
    let http = client()?;
    let batches = words.len().div_ceil(FILLER_BATCH);
    let mut picks = Vec::new();
    for (batch, slice) in words.chunks(FILLER_BATCH).enumerate() {
        cancelled(cancel)?;
        report(
            app,
            shared,
            id,
            "generating",
            0.8 + 0.18 * batch as f32 / batches as f32,
            format!(
                "Asking {} for fillers, batch {} of {batches}",
                settings.cleanup_model,
                batch + 1
            ),
        );
        let first = batch * FILLER_BATCH;
        let reply = ask_chat_model(&http, settings, &filler_prompt(slice, first), cancel)?;
        picks.extend(parse_filler_picks(&reply, slice, first)?);
    }
    Ok(AiEditResult {
        captions: Vec::new(),
        silence_ranges: Vec::new(),
        removed_duration_ms: 0,
        fillers: filler_ranges(&words, &picks),
        base_revision: revision,
    })
}

/// One chat completion against an OpenAI-compatible server such as Ollama or
/// LM Studio. Returns the reply text.
pub(crate) fn ask_chat_model(
    http: &Client,
    settings: &Settings,
    prompt: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let endpoint = settings.cleanup_endpoint.trim().trim_end_matches('/');
    if endpoint.is_empty() {
        return Err("the language model endpoint is empty".into());
    }
    let url = if endpoint.ends_with("/chat/completions") {
        endpoint.to_string()
    } else {
        format!("{endpoint}/chat/completions")
    };
    let body = send_request(
        http.post(url).json(&json!({
            "model": settings.cleanup_model,
            "temperature": 0,
            "stream": false,
            "messages": [
                {"role": "system", "content": "You edit spoken video transcripts. You answer with JSON only."},
                {"role": "user", "content": prompt},
            ],
        })),
        cancel,
    )?;
    let value: serde_json::Value = serde_json::from_str(&body)
        .map_err(|error| format!("the language model response is not JSON: {error}"))?;
    value["choices"][0]["message"]["content"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "the language model returned no message".into())
}
