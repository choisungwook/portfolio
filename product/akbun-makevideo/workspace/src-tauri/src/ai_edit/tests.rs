use super::*;
use makevideo_edit::{Document, ProjectSettings};

#[test]
fn provider_languages_are_normalized_for_each_api_family() {
    assert_eq!(openai_language("ko-KR"), "ko");
    assert_eq!(locale_language("ko"), "ko-KR");
    assert_eq!(locale_language("ja_JP"), "ja-JP");
}

#[test]
fn lm_studio_is_not_claimed_as_a_transcription_provider() {
    assert!(adapter("lmstudio").is_err());
    assert!(adapter("litellm").is_ok());
}

#[test]
fn a_job_locks_edits_and_rejects_parallel_work() {
    let runtime = AiEditRuntime::default();
    let (_, cancel) = begin_job(&runtime, "captions").unwrap();
    assert!(ensure_editable(&runtime).is_err());
    assert!(begin_job(&runtime, "silence").is_err());
    cancel.store(true, Ordering::SeqCst);
    assert_eq!(cancelled(&cancel), Err(CANCELLED.into()));
}

#[test]
fn captions_land_as_one_named_undo_step() {
    let document = Arc::new(Mutex::new(Document::new(ProjectSettings::default())));
    apply_captions(
        &document,
        0,
        7,
        &[TimedText {
            start_ms: 1_000,
            end_ms: 2_000,
            text: "hello".into(),
        }],
    )
    .unwrap();
    let mut document = document.lock().unwrap();
    let state = document.state();
    assert_eq!(state.undo_label, "Generate captions");
    let subtitles = state
        .project
        .tracks
        .iter()
        .find(|track| track.kind == TrackKind::Subtitle)
        .unwrap();
    assert_eq!(subtitles.visual_items.len(), 1);
    assert_eq!(subtitles.visual_items[0].start, 30);
    document.undo().unwrap();
    assert!(document
        .project()
        .tracks
        .iter()
        .all(|track| track.kind != TrackKind::Subtitle));
}

#[test]
fn fillers_land_as_one_named_step_and_refuse_a_stale_timeline() {
    let document = Arc::new(Mutex::new(Document::new(ProjectSettings::default())));
    let caption = TimedText {
        start_ms: 1_000,
        end_ms: 3_000,
        text: "um hello".into(),
    };
    apply_captions(&document, 0, 1, std::slice::from_ref(&caption)).unwrap();
    let cut = [TimeRange {
        start_ms: 1_000,
        end_ms: 1_500,
    }];
    assert!(apply_ranges(&document, 0, &cut, "Remove fillers")
        .unwrap_err()
        .contains("timeline changed"));
    let revision = document.lock().unwrap().revision();
    apply_ranges(&document, revision, &cut, "Remove fillers").unwrap();
    let mut document = document.lock().unwrap();
    assert_eq!(document.state().undo_label, "Remove fillers");
    let subtitle = document
        .project()
        .tracks
        .iter()
        .find(|track| track.kind == TrackKind::Subtitle)
        .unwrap()
        .visual_items[0]
        .clone();
    assert_eq!(subtitle.duration, 45, "half a second of the caption is cut");
    document.undo().unwrap();
}

/// Real local servers, so opt-in:
/// `MAKEVIDEO_CHAT=http://127.0.0.1:11434/v1 MAKEVIDEO_CHAT_MODEL=qwen2.5:1.5b
/// cargo test -p akbun-makevideo --lib local_fillers -- --ignored`.
/// Set `MAKEVIDEO_STT` to a local whisper server to transcribe speech made
/// with macOS `say` instead of using a fixed word list.
#[test]
#[ignore]
fn local_fillers_end_to_end() {
    let mut settings = Settings::default();
    settings.cleanup_endpoint = std::env::var("MAKEVIDEO_CHAT").unwrap();
    settings.cleanup_model = std::env::var("MAKEVIDEO_CHAT_MODEL").unwrap();
    let sentence = "So um I think uh we we should start the the demo now";
    let http = client().unwrap();
    let cancel = AtomicBool::new(false);
    let words = match std::env::var("MAKEVIDEO_STT") {
        Ok(endpoint) => {
            let dir = tempfile::tempdir().unwrap();
            let aiff = dir.path().join("speech.aiff");
            let mp3 = dir.path().join("speech.mp3");
            assert!(Command::new("say").arg("-o").arg(&aiff).arg(sentence).status().unwrap().success());
            assert!(Command::new("ffmpeg")
                .args(["-loglevel", "error", "-y", "-i"])
                .arg(&aiff)
                .args(["-ac", "1", "-ar", "16000"])
                .arg(&mp3)
                .status()
                .unwrap()
                .success());
            settings.transcription_endpoint = endpoint;
            settings.transcription_model =
                std::env::var("MAKEVIDEO_STT_MODEL").unwrap_or_else(|_| "whisper-1".into());
            settings.transcription_language = "en".into();
            let adapter = adapter("custom").unwrap();
            let request = adapter
                .request(&http, std::fs::read(&mp3).unwrap(), &settings, None)
                .unwrap();
            adapter.parse_words(&send_request(request, &cancel).unwrap(), 0).unwrap()
        }
        Err(_) => sentence
            .split(' ')
            .enumerate()
            .map(|(index, word)| TimedText {
                start_ms: 1_000 + index as u64 * 300,
                end_ms: 1_000 + index as u64 * 300 + 250,
                text: word.into(),
            })
            .collect(),
    };
    let reply = ask_chat_model(&http, &settings, &filler_prompt(&words, 0), &cancel).unwrap();
    let picks = parse_filler_picks(&reply, &words, 0).unwrap();
    let cuts = filler_ranges(&words, &picks);
    eprintln!("words: {:?}\nreply: {reply}\ncuts: {cuts:?}", words.iter().map(|w| &w.text).collect::<Vec<_>>());
    assert!(
        cuts.iter().any(|cut| cut.text.to_lowercase().contains("um") || cut.text.to_lowercase().contains("uh")),
        "the model kept every filler: {reply}"
    );

    let document = Arc::new(Mutex::new(Document::new(ProjectSettings::default())));
    let span = TimedText {
        start_ms: 0,
        end_ms: words.last().unwrap().end_ms + 1_000,
        text: sentence.into(),
    };
    apply_captions(&document, 0, 1, std::slice::from_ref(&span)).unwrap();
    let before = document.lock().unwrap().project().duration_frames();
    let revision = document.lock().unwrap().revision();
    let ranges: Vec<_> = cuts
        .iter()
        .map(|cut| TimeRange { start_ms: cut.start_ms, end_ms: cut.end_ms })
        .collect();
    apply_ranges(&document, revision, &ranges, "Remove fillers").unwrap();
    let mut document = document.lock().unwrap();
    assert!(document.project().duration_frames() < before);
    document.undo().unwrap();
    assert_eq!(document.project().duration_frames(), before);
}
