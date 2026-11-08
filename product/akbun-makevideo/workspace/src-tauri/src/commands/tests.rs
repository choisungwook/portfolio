use super::{
    automatic_playback_backend, clone_arc, explicit_playback_backend, lenient_cache_matches,
    native_preview_dimensions, playback_change, playback_guides_changed,
    playback_video_settings_changed, process_metrics_rows, process_tree_rss_bytes,
    proxy_refresh_should_retry, restore_if_current, srt_contents, srt_cues, srt_frame,
    srt_timestamp, store_if_current, strict_cache_matches, validate_strict_compositor,
    wanted_device, PlaybackChange, PlaybackSettingsGate, Settings,
};
use makevideo_compositor::{Backend, Compositor};
use makevideo_render::Rate;
use std::sync::atomic::AtomicU64;
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[test]
fn an_unset_graphics_device_is_the_automatic_pick() {
    assert_eq!(wanted_device(""), None);
    assert_eq!(wanted_device("   "), None);
    assert_eq!(wanted_device("Apple M3 Pro"), Some("Apple M3 Pro"));
}

#[test]
fn startup_is_lenient_but_an_explicit_live_gpu_choice_is_strict() {
    let settings = Settings::default();
    assert_eq!(automatic_playback_backend(&settings), Backend::Auto);
    assert_eq!(explicit_playback_backend(&settings), Backend::Gpu);

    let mut cpu = settings;
    cpu.compositor = "cpu".into();
    assert_eq!(automatic_playback_backend(&cpu), Backend::Cpu);
    assert_eq!(explicit_playback_backend(&cpu), Backend::Cpu);
}

#[test]
fn strict_validation_rechecks_a_cached_compositor() {
    let cpu = Compositor::with_backend(Backend::Cpu).unwrap();
    assert!(validate_strict_compositor(Backend::Gpu, None, &cpu).is_err());
    assert!(validate_strict_compositor(Backend::Cpu, Some("missing adapter"), &cpu).is_err());
    assert!(validate_strict_compositor(Backend::Cpu, None, &cpu).is_ok());
}

#[test]
fn named_gpu_reuses_the_actual_default_adapter_and_creates_an_alias() {
    let default_key = (Backend::Auto, String::new());
    assert!(strict_cache_matches(
        Backend::Gpu,
        Some("Apple M3"),
        &default_key,
        true,
        "Apple M3",
    ));
    assert!(lenient_cache_matches(
        Backend::Auto,
        Some("Apple M3"),
        &default_key,
        true,
        "Apple M3",
    ));
}

#[test]
fn clearing_a_named_gpu_uses_only_the_default_cache_identity() {
    let named_key = (Backend::Gpu, "Discrete GPU".into());
    let default_key = (Backend::Auto, String::new());
    assert!(!strict_cache_matches(
        Backend::Gpu,
        None,
        &named_key,
        true,
        "Discrete GPU",
    ));
    assert!(strict_cache_matches(
        Backend::Gpu,
        None,
        &default_key,
        true,
        "Default GPU",
    ));
    assert!(!lenient_cache_matches(
        Backend::Auto,
        None,
        &named_key,
        true,
        "Discrete GPU",
    ));
}

#[test]
fn automatic_refresh_waits_for_every_explicit_settings_transaction() {
    let gate = Arc::new(PlaybackSettingsGate::default());
    let first = gate.enter();
    let second = gate.enter();
    let (sent, received) = channel();
    let waiting = Arc::clone(&gate);
    let thread = std::thread::spawn(move || {
        waiting.wait();
        let _ = sent.send(());
    });

    assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
    drop(first);
    assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
    drop(second);
    assert_eq!(received.recv_timeout(Duration::from_secs(1)), Ok(()));
    thread.join().unwrap();
}

#[test]
fn explicit_settings_wait_until_an_attach_snapshot_is_stored() {
    let gate = Arc::new(PlaybackSettingsGate::default());
    let attach = gate.enter_attach();
    let (sent, received) = channel();
    let waiting = Arc::clone(&gate);
    let thread = std::thread::spawn(move || {
        let _settings = waiting.enter();
        let _ = sent.send(());
    });

    assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
    drop(attach);
    assert_eq!(received.recv_timeout(Duration::from_secs(1)), Ok(()));
    thread.join().unwrap();
}

#[test]
fn attach_waits_until_the_latest_settings_transaction_finishes() {
    let gate = Arc::new(PlaybackSettingsGate::default());
    let settings = gate.enter();
    let (sent, received) = channel();
    let waiting = Arc::clone(&gate);
    let thread = std::thread::spawn(move || {
        let _attach = waiting.enter_attach();
        let _ = sent.send(());
    });

    assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
    drop(settings);
    assert_eq!(received.recv_timeout(Duration::from_secs(1)), Ok(()));
    thread.join().unwrap();
}

#[test]
fn proxy_refresh_waits_for_an_attaching_session_before_lookup() {
    let gate = Arc::new(PlaybackSettingsGate::default());
    let attach = gate.enter_attach();
    let (sent, received) = channel();
    let waiting = Arc::clone(&gate);
    let thread = std::thread::spawn(move || {
        waiting.wait();
        let _ = sent.send(());
    });

    assert!(received.recv_timeout(Duration::from_millis(10)).is_err());
    drop(attach);
    assert_eq!(received.recv_timeout(Duration::from_secs(1)), Ok(()));
    thread.join().unwrap();
}

#[test]
fn an_auto_refresh_retries_the_explicit_priority_race() {
    assert!(proxy_refresh_should_retry(
        crate::playback::EXPLICIT_RECONFIGURE_PENDING
    ));
    assert!(!proxy_refresh_should_retry("candidate surface refused"));
}

#[test]
fn guide_only_changes_do_not_choose_the_video_replacement_path() {
    let before = Settings::default();
    let mut after = before.clone();
    after.show_rule_of_thirds = true;
    assert!(playback_guides_changed(&before, &after));
    assert!(!playback_video_settings_changed(&before, &after));

    after.preview_quality = "full".into();
    assert!(playback_video_settings_changed(&before, &after));
}

#[test]
fn reverting_to_confirmed_settings_replaces_an_unconfirmed_live_candidate() {
    let mut confirmed = Settings::default();
    confirmed.preview_quality = "full".into();
    let mut first = confirmed.clone();
    first.preview_quality = "half".into();

    assert_eq!(
        playback_change(&confirmed, &first, false),
        PlaybackChange::Video
    );
    assert_eq!(
        playback_change(&confirmed, &confirmed, false),
        PlaybackChange::None
    );
    assert_eq!(
        playback_change(&confirmed, &confirmed, true),
        PlaybackChange::Video
    );
}

#[test]
fn cloning_a_playback_handle_releases_the_registry_lock_before_waiting() {
    let slot = Mutex::new(Some(Arc::new(7)));
    let handle = clone_arc(&slot).unwrap();
    assert!(slot.try_lock().is_ok());
    assert_eq!(*handle, 7);
}

#[test]
fn release_epoch_prevents_a_late_attach_from_repopulating_the_registry() {
    let slot = Mutex::new(None);
    let epoch = AtomicU64::new(4);
    let started_at = epoch.load(std::sync::atomic::Ordering::SeqCst);
    epoch.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

    let rejected = store_if_current(&slot, &epoch, started_at, Arc::new(7));
    assert!(rejected.is_err());
    assert!(slot.lock().unwrap().is_none());
}

#[test]
fn newest_failed_setting_restores_confirmed_playback_after_older_commit() {
    let latest = AtomicU64::new(2);
    let live = AtomicU64::new(1);
    assert_eq!(
        restore_if_current(&latest, 2, || {
            live.store(0, std::sync::atomic::Ordering::Relaxed);
            Ok(())
        }),
        None
    );
    assert_eq!(live.load(std::sync::atomic::Ordering::Relaxed), 0);

    latest.store(3, std::sync::atomic::Ordering::Relaxed);
    let _ = restore_if_current(&latest, 2, || {
        live.store(9, std::sync::atomic::Ordering::Relaxed);
        Ok(())
    });
    assert_eq!(live.load(std::sync::atomic::Ordering::Relaxed), 0);
}

#[test]
fn srt_frame_accepts_comma_and_dot_milliseconds() {
    let rate = Rate::fps(30);
    assert_eq!(srt_frame("00:01:02,500", rate), Ok(1_875));
    assert_eq!(srt_frame("00:01:02.500", rate), Ok(1_875));
}

#[test]
fn srt_timestamp_round_trips_within_one_frame() {
    let rate = Rate::new(30_000, 1_001);
    let frame = 12_345;
    let parsed = srt_frame(&srt_timestamp(frame, rate), rate).unwrap();
    assert!((parsed - frame).abs() <= 1);
}

#[test]
fn srt_cues_keep_multiline_text_and_export_in_start_order() {
    let rate = Rate::fps(30);
    let cues = srt_cues(
        "2\n00:00:02,000 --> 00:00:03,000\nsecond\n\n1\n00:00:00,000 --> 00:00:01,000\nfirst\nline",
        rate,
    )
    .unwrap();
    let output = srt_contents(
        cues.iter()
            .map(|(start, end, text)| (*start, *end, text.as_str()))
            .collect(),
        rate,
    );

    assert_eq!(
        output,
        "1\n00:00:00,000 --> 00:00:01,000\nfirst\nline\n\n2\n00:00:02,000 --> 00:00:03,000\nsecond\n\n"
    );
}

#[test]
fn existing_settings_delete_the_project_folder_by_default() {
    let settings: Settings = serde_json::from_str("{}").unwrap();
    assert!(settings.delete_project_folder);
}

#[test]
fn monitor_guides_are_off_by_default() {
    let settings: Settings = serde_json::from_str("{}").unwrap();
    assert!(!settings.show_action_safe_area);
    assert!(!settings.show_title_safe_area);
    assert!(!settings.show_rule_of_thirds);
    assert!(!settings.show_center_lines);
}

#[test]
fn native_monitor_honours_preview_quality() {
    assert_eq!(native_preview_dimensions(1920, 1080, "full"), (1920, 1080));
    assert_eq!(native_preview_dimensions(1920, 1080, "half"), (960, 540));
    assert_eq!(native_preview_dimensions(1920, 1080, "quarter"), (480, 270));
    assert_eq!(native_preview_dimensions(1080, 1920, "quarter"), (270, 480));
}

#[test]
fn memory_includes_descendants_but_not_neighbours() {
    let ps = "10 1 100\n11 10 20\n12 11 5\n20 1 900\n";
    assert_eq!(process_tree_rss_bytes(ps, 10), 125 * 1024);
}

#[test]
fn process_metrics_rejects_invalid_rows() {
    assert!(process_metrics_rows("10 1 100 0.2\nbroken row\n").is_err());
}
