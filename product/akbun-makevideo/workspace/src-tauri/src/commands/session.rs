use super::*;

/// What the page gets back when it asks for the monitor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackChoice {
    /// "native" or "media-element". The page runs the old preview for the
    /// second one and leaves the transport to Rust for the first.
    pub engine: String,
    /// Why it is not native, when the setting asked for native and it could not
    /// start. `None` when nothing went wrong, including when the media element
    /// preview was simply chosen — a preference is not a failure.
    pub fell_back: Option<String>,
    pub status: Option<PlaybackStatus>,
}

impl PlaybackChoice {
    pub(crate) fn from(choice: Choice, status: Option<PlaybackStatus>) -> PlaybackChoice {
        PlaybackChoice {
            engine: choice.engine.as_str().to_string(),
            fell_back: choice.fell_back,
            status,
        }
    }
}

/// Start the native monitor on a view at `place`, or say why it could not.
///
/// The page calls this when a project opens and whenever the setting changes,
/// and it acts on the answer: `native` means the transport commands below are
/// the playhead, `media-element` means the page's own preview is.
///
/// This never returns an error. A monitor that will not start is a fallback and
/// not a failure — playback is the app's main path, and an editor that refuses
/// to open because a graphics device is missing is worse than one that plays
/// the way it always has.
#[tauri::command]
pub fn playback_attach(
    window: tauri::WebviewWindow,
    state: State<AppState>,
    place: MonitorPlace,
    frame: i64,
) -> PlaybackChoice {
    let _attach = state.playback_settings.enter_attach();
    let attach_epoch = state.playback_epoch.load(Ordering::SeqCst);
    let settings = state.settings.lock().unwrap().clone();
    // Already running: place it and hand back what it is doing. The page asks
    // again on every layout change, and tearing the session down to build the
    // same one would restart the decoders every time somebody dragged a panel.
    if let Some(session) = playback_session(&state) {
        session.place(place);
        return PlaybackChoice::from(Choice::native(), Some(session.status()));
    }

    // The setting is read before anything is built. Starting a session and
    // then throwing it away because the setting said media elements would put a
    // native view on screen for as long as it took to notice, which is a flash
    // of the wrong picture over the stage.
    let wanted = wanted_engine(&settings);
    if makevideo_present::Engine::parse(wanted) == makevideo_present::Engine::MediaElement {
        return PlaybackChoice::from(choose(wanted, Ok(())), None);
    }

    let session = match start_session(&window, &state, &settings, place, frame) {
        Ok(session) => Arc::new(session),
        Err(reason) => {
            if let Some(existing) = playback_session(&state) {
                return PlaybackChoice::from(Choice::native(), Some(existing.status()));
            }
            return PlaybackChoice::from(choose(wanted, Err(reason)), None);
        }
    };
    match store_if_current(
        &state.playback,
        &state.playback_epoch,
        attach_epoch,
        Arc::clone(&session),
    ) {
        Ok(()) => PlaybackChoice::from(Choice::native(), Some(session.status())),
        Err(rejected) => {
            rejected.stop();
            if state.playback_epoch.load(Ordering::SeqCst) == attach_epoch {
                if let Some(existing) = playback_session(&state) {
                    return PlaybackChoice::from(Choice::native(), Some(existing.status()));
                }
            }
            PlaybackChoice::from(
                Choice::fallback("playback attach was cancelled before it became active"),
                None,
            )
        }
    }
}

pub(crate) fn start_session(
    window: &tauri::WebviewWindow,
    state: &State<AppState>,
    settings: &Settings,
    place: MonitorPlace,
    frame: i64,
) -> Result<Session, String> {
    if !place.is_visible() {
        return Err("the monitor has no room on screen yet".into());
    }
    let config = automatic_playback_config(&window.app_handle(), state, settings)?;
    Session::start(
        window,
        Arc::clone(&state.document),
        config,
        place,
        frame.max(0),
    )
}

pub(crate) fn explicit_playback_config(
    app: &AppHandle,
    state: &State<AppState>,
    settings: &Settings,
) -> Result<PlaybackConfig, String> {
    let backend = explicit_playback_backend(settings);
    let device = if backend == Backend::Gpu {
        wanted_device(&settings.gpu_device)
    } else {
        None
    };
    let compositor = strict_compositor(state, backend, device)?;
    let presenter = if compositor.is_gpu() {
        Arc::clone(&compositor)
    } else {
        strict_compositor(state, Backend::Gpu, None)?
    };
    build_playback_config(app, state, settings, compositor, presenter)
}

pub(crate) fn automatic_playback_config(
    app: &AppHandle,
    state: &State<AppState>,
    settings: &Settings,
) -> Result<PlaybackConfig, String> {
    let compositor = compositor(
        state,
        automatic_playback_backend(settings),
        wanted_device(&settings.gpu_device),
    );
    let presenter = if compositor.is_gpu() {
        Arc::clone(&compositor)
    } else {
        strict_compositor(state, Backend::Gpu, None)?
    };
    build_playback_config(app, state, settings, compositor, presenter)
}

pub(crate) fn build_playback_config(
    app: &AppHandle,
    state: &State<AppState>,
    settings: &Settings,
    compositor: Arc<Compositor>,
    presenter: Arc<Compositor>,
) -> Result<PlaybackConfig, String> {
    let project = state.document.lock().unwrap().project().clone();
    let ffmpeg = find_tool(app, "ffmpeg", &settings.ffmpeg_dir)
        .ok_or("ffmpeg was not found, so nothing can be decoded")?;
    let proxy_paths = if settings.proxy_enabled {
        ready_proxy_paths(&state.proxies.lock().unwrap())
    } else {
        HashMap::new()
    };
    let current_ffmpeg_dir = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let probe = if current_ffmpeg_dir == settings.ffmpeg_dir {
        acceleration(state, Some(&ffmpeg))
    } else {
        detect_acceleration(&ffmpeg)
    };
    let hwaccel = probe.available.and_then(|candidate| candidate.hwaccel);
    let (preview_width, preview_height) = native_preview_dimensions(
        project.settings.width,
        project.settings.height,
        &settings.preview_quality,
    );
    let config = PlaybackConfig::new(compositor, ffmpeg, preview_width, preview_height)
        .with_presenter(presenter)
        .with_hwaccel(hwaccel)
        .with_guides(playback_guides(settings));
    Ok(if settings.proxy_enabled {
        config.with_proxies(proxy_paths)
    } else {
        config
    })
}

pub(crate) fn playback_video_settings_changed(before: &Settings, after: &Settings) -> bool {
    before.preview_quality != after.preview_quality
        || before.compositor != after.compositor
        || before.gpu_device != after.gpu_device
        || before.proxy_enabled != after.proxy_enabled
        || before.ffmpeg_dir != after.ffmpeg_dir
}

pub(crate) fn playback_guides_changed(before: &Settings, after: &Settings) -> bool {
    before.show_action_safe_area != after.show_action_safe_area
        || before.show_title_safe_area != after.show_title_safe_area
        || before.show_rule_of_thirds != after.show_rule_of_thirds
        || before.show_center_lines != after.show_center_lines
}

pub(crate) fn playback_guides(settings: &Settings) -> Guides {
    Guides {
        action_safe_area: settings.show_action_safe_area,
        title_safe_area: settings.show_title_safe_area,
        rule_of_thirds: settings.show_rule_of_thirds,
        center_lines: settings.show_center_lines,
    }
}

pub(crate) fn native_preview_dimensions(width: u32, height: u32, quality: &str) -> (u32, u32) {
    let divisor = match quality {
        "full" => 1,
        "half" => 2,
        _ => 4,
    };
    let scaled = |value: u32| {
        let value = (value / divisor).max(2);
        value - value % 2
    };
    (scaled(width), scaled(height))
}

/// Stop the native monitor and take its view down. The page falls back to its
/// own preview until it attaches again.
#[tauri::command]
pub fn playback_release(state: State<AppState>) {
    // Dropped outside the lock: taking the session down joins its thread, and
    // holding the lock through that would block every other command.
    state.playback_epoch.fetch_add(1, Ordering::SeqCst);
    let session = state.playback.lock().unwrap().take();
    if let Some(session) = session.as_ref() {
        session.stop();
    }
    drop(session);
}

/// Refresh ready proxy paths without releasing the native session. The same
/// first-present transaction used by settings changes keeps audio and the old
/// video path live until the refreshed path is visible.
#[tauri::command]
pub fn playback_refresh(state: State<AppState>) -> Result<Option<PlaybackStatus>, String> {
    loop {
        state.playback_settings.wait();
        let Some(session) = playback_session(&state) else {
            return Ok(None);
        };
        let proxy_paths = ready_proxy_paths(&state.proxies.lock().unwrap());
        match session.refresh_proxies(proxy_paths) {
            Ok(status) => return Ok(Some(status)),
            Err(reason) if proxy_refresh_should_retry(&reason) => continue,
            Err(reason) => return Err(reason),
        }
    }
}

pub(crate) fn proxy_refresh_should_retry(reason: &str) -> bool {
    reason == EXPLICIT_RECONFIGURE_PENDING
}

#[tauri::command]
pub fn playback_play(state: State<AppState>) -> Result<Option<PlaybackStatus>, String> {
    with_session_result(&state, |session| session.play())
}

#[tauri::command]
pub fn playback_pause(state: State<AppState>) -> Result<Option<PlaybackStatus>, String> {
    with_session_result(&state, |session| session.pause())
}

#[tauri::command]
pub fn playback_seek(
    state: State<AppState>,
    frame: i64,
) -> Result<Option<PlaybackStatus>, String> {
    with_session_result(&state, |session| session.seek(frame.max(0)))
}

/// The timeline changed. A stopped playhead redraws its frame; a playing one
/// ignores it, because the frame source is already reading the edit it was
/// built from and rebuilding mid-playback would be a stall.
#[tauri::command]
pub fn playback_redraw(state: State<AppState>) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.redraw())
}

#[tauri::command]
pub fn playback_place(state: State<AppState>, place: MonitorPlace) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.place(place))
}

/// Show or hide the monitor's view.
///
/// The page calls this when it is about to draw over the stage — a settings
/// sheet, an open menu — because a native view sits over the webview and is not
/// in the page's stacking order. Playback carries on behind it, so closing the
/// sheet shows the picture where it got to rather than where it was.
#[tauri::command]
pub fn playback_visible(state: State<AppState>, visible: bool) -> Option<PlaybackStatus> {
    with_session(&state, |session| session.set_visible(visible))
}

/// Where the playhead is, and what the monitor has done since it started.
///
/// The page polls this rather than being pushed to. A frame is 33 ms and an
/// event per frame across the IPC boundary is exactly the traffic the native
/// monitor exists to remove; the page only needs the playhead often enough to
/// draw it, which is its own animation frame.
#[tauri::command]
pub fn playback_status(state: State<AppState>) -> Option<PlaybackStatus> {
    playback_session(&state).map(|session| session.status())
}

pub(crate) fn with_session<F>(state: &State<AppState>, act: F) -> Option<PlaybackStatus>
where
    F: FnOnce(&Session),
{
    let session = playback_session(state)?;
    act(&session);
    Some(session.status())
}

pub(crate) fn with_session_result<F>(
    state: &State<AppState>,
    act: F,
) -> Result<Option<PlaybackStatus>, String>
where
    F: FnOnce(&Session) -> Result<(), String>,
{
    let Some(session) = playback_session(state) else {
        return Ok(None);
    };
    act(&session)?;
    Ok(Some(session.status()))
}

pub(crate) fn playback_session(state: &State<AppState>) -> Option<Arc<Session>> {
    clone_arc(&state.playback)
}

pub(crate) fn clone_arc<T>(slot: &Mutex<Option<Arc<T>>>) -> Option<Arc<T>> {
    slot.lock().unwrap().as_ref().map(Arc::clone)
}

pub(crate) fn store_if_current<T>(
    slot: &Mutex<Option<Arc<T>>>,
    epoch: &AtomicU64,
    started_at: u64,
    value: Arc<T>,
) -> Result<(), Arc<T>> {
    let mut slot = slot.lock().unwrap();
    if epoch.load(Ordering::SeqCst) != started_at || slot.is_some() {
        return Err(value);
    }
    *slot = Some(value);
    Ok(())
}
