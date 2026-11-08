use super::*;

/// The page reads a session's numbers while the loop writes them, so the
/// shape has to be shareable without a lock on the hot path.
#[test]
fn shared_state_starts_empty_and_is_readable() {
    let shared = Shared::default();
    assert_eq!(shared.position(), 0);
    assert!(!shared.playing());
    assert_eq!(shared.failure(), None);
}

fn assert_send_sync<T: Send + Sync>() {}

/// The loop writes these from its own thread and the command handlers read
/// them from tauri's. If this stops compiling, something that is not safe
/// to share got into the struct.
#[test]
fn shared_state_crosses_threads() {
    assert_send_sync::<Shared>();
    assert_send_sync::<Counters>();
}

#[test]
fn counters_keep_the_latest_and_peak_playback_measurements() {
    let counters = Counters::default();
    counters.record_present(4.25, -1.5);
    counters.record_present(2.0, 8.75);

    assert_eq!(counters.last_present_us.load(Ordering::Relaxed), 2_000);
    assert_eq!(counters.peak_present_us.load(Ordering::Relaxed), 4_250);
    assert_eq!(counters.last_late_us.load(Ordering::Relaxed), 8_750);
    assert_eq!(counters.peak_late_us.load(Ordering::Relaxed), 8_750);
}

#[test]
fn a_later_generation_supersedes_pending_and_stale_work_cannot_return() {
    let mut latest = 0;
    assert!(accept_generation(&mut latest, 1));
    assert!(accept_generation(&mut latest, 3));
    assert!(!accept_generation(&mut latest, 2));
    assert!(!accept_generation(&mut latest, 3));
    assert_eq!(latest, 3);
}

#[test]
fn a_slow_older_settings_build_cannot_commit_after_a_newer_generation() {
    let order = Arc::new(SettingsOrder::default());
    order.reserve(1);
    let (release, delayed) = std::sync::mpsc::channel();
    let (sent, answer) = std::sync::mpsc::channel();
    let worker_order = Arc::clone(&order);
    let worker = std::thread::spawn(move || {
        delayed.recv().unwrap();
        sent.send(worker_order.lock_if_current(1).is_some())
            .unwrap();
    });

    order.reserve(2);
    release.send(()).unwrap();
    assert_eq!(answer.recv().unwrap(), false);
    worker.join().unwrap();
}

#[test]
fn settings_reservation_cannot_cross_a_candidate_commit_lock() {
    let order = Arc::new(SettingsOrder::default());
    order.reserve(1);
    let commit = order.lock_if_current(1).unwrap();
    let (sent, answer) = std::sync::mpsc::channel();
    let worker_order = Arc::clone(&order);
    let worker = std::thread::spawn(move || {
        worker_order.reserve(2);
        sent.send(()).unwrap();
    });

    assert!(answer.recv_timeout(Duration::from_millis(10)).is_err());
    drop(commit);
    assert_eq!(answer.recv_timeout(Duration::from_secs(1)), Ok(()));
    worker.join().unwrap();
}

#[test]
fn committed_settings_remain_unconfirmed_until_persistence_succeeds() {
    let order = SettingsOrder::default();
    order.reserve(1);
    {
        let mut commit = order.lock_if_current(1).unwrap();
        commit.committed = 1;
    }
    assert!(order.has_unconfirmed());

    order.reserve(2);
    {
        let mut restore = order.lock_if_current(2).unwrap();
        restore.committed = 2;
    }
    order.lock_if_current(2).unwrap().confirmed = 2;
    assert!(!order.has_unconfirmed());
}

#[test]
fn confirmed_config_survives_an_unpersisted_live_commit() {
    let compositor =
        Arc::new(Compositor::with_backend(makevideo_compositor::Backend::Cpu).unwrap());
    let confirmed = Config::new(Arc::clone(&compositor), "ffmpeg".into(), 1920, 1080);
    let live = Config::new(compositor, "ffmpeg".into(), 960, 540);
    let shared = Shared::default();
    shared.initialize_config(&confirmed);
    shared.settings_order.reserve(1);
    {
        let mut commit = shared.settings_order.lock_if_current(1).unwrap();
        shared.set_live_config(&live);
        commit.committed = 1;
    }

    shared.settings_order.reserve(2);
    assert!(shared.settings_order.has_unconfirmed());
    let rollback = shared.confirmed_config.lock().unwrap().clone().unwrap();
    assert_eq!((rollback.width, rollback.height), (1920, 1080));
    assert_eq!(
        shared
            .live_config
            .lock()
            .unwrap()
            .as_ref()
            .map(|config| (config.width, config.height)),
        Some((960, 540))
    );
}

#[test]
fn confirmed_rollback_keeps_a_proxy_that_became_ready_during_live_settings() {
    let compositor =
        Arc::new(Compositor::with_backend(makevideo_compositor::Backend::Cpu).unwrap());
    let mut old_paths = HashMap::new();
    old_paths.insert("asset".into(), "/proxy/r0.mov".into());
    let confirmed =
        Config::new(Arc::clone(&compositor), "ffmpeg".into(), 1920, 1080).with_proxies(old_paths);
    let live = Config::new(Arc::clone(&compositor), "ffmpeg".into(), 960, 540)
        .with_proxies(confirmed.proxy_paths.clone());
    let shared = Shared::default();
    shared.initialize_config(&confirmed);
    shared.set_live_config(&live);

    let mut ready_paths = HashMap::new();
    ready_paths.insert("asset".into(), "/proxy/r1.mov".into());
    let refreshed = Config::new(compositor, "ffmpeg".into(), 960, 540).with_proxies(ready_paths);
    shared.set_confirmed_proxy_paths(&refreshed);

    let rollback = shared.confirmed_config.lock().unwrap().clone().unwrap();
    assert_eq!((rollback.width, rollback.height), (1920, 1080));
    assert_eq!(rollback.proxy_paths["asset"], "/proxy/r1.mov");
}

#[test]
fn a_late_visible_command_cannot_undo_release_final_hide() {
    let stopped = AtomicBool::new(true);
    let visible = Mutex::new(false);
    apply_session_visibility(&stopped, &visible, true, |slot, wanted| *slot = wanted);
    assert!(!*visible.lock().unwrap());
}

#[test]
fn automatic_refresh_cannot_supersede_an_explicit_candidate() {
    assert!(!proxy_refresh_allowed(Some(ReplacementOwner::Settings(7))));
    assert!(proxy_refresh_allowed(Some(ReplacementOwner::ProxyRefresh)));
    assert!(proxy_refresh_allowed(None));
}

#[test]
fn proxy_refresh_merges_only_paths_into_the_active_explicit_config() {
    let compositor =
        Arc::new(Compositor::with_backend(makevideo_compositor::Backend::Cpu).unwrap());
    let mut old = HashMap::new();
    old.insert("asset".into(), "/proxy/old.mov".into());
    let active = Config::new(compositor, "ffmpeg-new".into(), 960, 540)
        .with_proxies(old)
        .with_guides(Guides {
            center_lines: true,
            ..Guides::default()
        });
    let mut ready = HashMap::new();
    ready.insert("asset".into(), "/proxy/new.mov".into());

    let refreshed = refreshed_proxy_config(&active, ready.clone());
    assert_eq!(refreshed.proxy_paths, ready);
    assert_eq!(refreshed.ffmpeg, "ffmpeg-new");
    assert_eq!((refreshed.width, refreshed.height), (960, 540));
    assert!(refreshed.guides.center_lines);

    let disabled = Config::new(active.compositor, "ffmpeg-new".into(), 960, 540);
    assert!(refreshed_proxy_config(&disabled, ready)
        .proxy_paths
        .is_empty());
}

#[test]
fn explicit_candidate_keeps_proxy_paths_an_auto_refresh_already_committed() {
    let compositor =
        Arc::new(Compositor::with_backend(makevideo_compositor::Backend::Cpu).unwrap());
    let mut active_paths = HashMap::new();
    active_paths.insert("asset".into(), "/proxy/r1.mov".into());
    let active =
        Config::new(Arc::clone(&compositor), "ffmpeg".into(), 480, 270).with_proxies(active_paths);
    let mut candidate_paths = HashMap::new();
    candidate_paths.insert("asset".into(), "/proxy/r0.mov".into());
    let mut candidate =
        Config::new(compositor, "ffmpeg".into(), 1920, 1080).with_proxies(candidate_paths);

    merge_active_proxy_paths(&mut candidate, &active);
    assert_eq!(candidate.proxy_paths.len(), 1);
    assert_eq!(candidate.proxy_paths["asset"], "/proxy/r1.mov");

    candidate.proxy_enabled = false;
    merge_active_proxy_paths(&mut candidate, &active);
    assert!(candidate.proxy_paths.is_empty());
}
