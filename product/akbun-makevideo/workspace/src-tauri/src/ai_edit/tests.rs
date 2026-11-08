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
