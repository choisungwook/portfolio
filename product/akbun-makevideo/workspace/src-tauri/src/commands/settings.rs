use super::*;

/// Application settings, as opposed to the project settings that live in the
/// project file. These follow the user, not the edit.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "system", "light" or "dark".
    pub theme: String,
    /// "full", "half" or "quarter". Quarter by default: it leaves decoding
    /// headroom when proxy generation and a multi-track preview overlap.
    pub preview_quality: String,
    /// Drop preview audio while the playhead is being dragged. Scrubbing with
    /// audio on means a seek per frame, which is what actually stalls playback.
    pub preview_mute_while_scrubbing: bool,
    /// Snap clips to nearby edges. Mirrors the magnet button in the timeline.
    pub snap: bool,
    /// Editor-only overlays. These follow the app, not the project or render.
    pub show_action_safe_area: bool,
    pub show_title_safe_area: bool,
    pub show_rule_of_thirds: bool,
    pub show_center_lines: bool,
    /// The resolution a new project starts with.
    pub default_width: u32,
    pub default_height: u32,
    /// The timebase a new project starts on, as a ratio so 29.97 is a choice
    /// somebody can actually make. A settings file written before this was a
    /// ratio has `defaultFps` instead, which is not read: losing a preference
    /// is a smaller thing than opening a project on the wrong rate.
    pub default_rate: Rate,
    /// Where project folders are made. Empty means the default, which is
    /// ~/Documents/akbun-makevideo.
    pub workspace_dir: String,
    /// Folder holding ffmpeg and ffprobe. Empty means look in the usual places.
    pub ffmpeg_dir: String,
    /// "auto" to encode on the GPU when this machine has one that works, "cpu"
    /// to always use libx264. There is no "force GPU": if the hardware path
    /// fails there is nothing to do but use the CPU, so auto already covers it.
    pub render_acceleration: String,
    /// The last Render sheet choices: "hd", "fhd" or "4k", and "high",
    /// "medium" or "low". The command validates them again on every render.
    pub render_preset: String,
    pub render_quality: String,
    /// Whether the graphics device or CPU composites: "gpu" or "cpu". Both
    /// play through the persistent native monitor; CPU frames use a small GPU
    /// presenter only for the final upload.
    ///
    /// | | exact frame | playback | render |
    /// | --- | --- | --- | --- |
    /// | gpu | the compositor | native monitor | the compositor, filter graph if it fails |
    /// | cpu | software compositor | native monitor | the filter graph |
    ///
    /// ffmpeg is needed either way: it decodes for both and encodes for both.
    /// What changes is who puts the layers on top of each other.
    ///
    /// Only "cpu" means cpu. The old "auto" and "ffmpeg" values, and anything
    /// else a settings file holds, are the graphics device — a machine with no
    /// device quietly draws with the software compositor rather than refusing.
    pub compositor: String,
    /// Which graphics adapter to draw on, by the name `graphics_devices`
    /// reports. Empty is whatever wgpu picks. A live change to a missing named
    /// adapter is rejected and the active path and saved setting are kept.
    pub gpu_device: String,
    /// Use ready proxy files for preview and playback. Proxy creation remains
    /// automatic so disabling this changes only which media is read.
    pub proxy_enabled: bool,
    /// Delete the managed project folder with its work file. When disabled,
    /// only project.akbunvideo goes to Trash and derived files remain.
    pub delete_project_folder: bool,
    /// Empty uses the operating system's application log directory.
    pub log_dir: String,
    /// Maximum size of errors.log before it becomes errors.log.1.
    pub log_rotation_size: u64,
    /// "kb" or "mb".
    pub log_rotation_unit: String,
    /// User changes to the page's built-in keyboard shortcuts. Missing actions
    /// keep their code-defined defaults, so new actions reach existing users.
    pub shortcut_overrides: HashMap<String, Vec<String>>,
    /// Codex App Server model and effort for the subscription-backed AI panel.
    pub ai_model: String,
    pub ai_effort: String,
    /// Speech recognition is a separate media API from the ChatGPT
    /// subscription. Credentials stay in memory and are never written here.
    pub transcription_provider: String,
    pub transcription_endpoint: String,
    pub transcription_model: String,
    pub transcription_language: String,
    pub silence_threshold_db: f32,
    pub silence_min_duration_ms: u64,
    pub silence_padding_ms: u64,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "system".into(),
            preview_quality: "quarter".into(),
            preview_mute_while_scrubbing: true,
            snap: true,
            show_action_safe_area: false,
            show_title_safe_area: false,
            show_rule_of_thirds: false,
            show_center_lines: false,
            default_width: 1920,
            default_height: 1080,
            default_rate: Rate::fps(30),
            workspace_dir: String::new(),
            ffmpeg_dir: String::new(),
            render_acceleration: "auto".into(),
            render_preset: "fhd".into(),
            render_quality: "medium".into(),
            compositor: "gpu".into(),
            gpu_device: String::new(),
            proxy_enabled: true,
            delete_project_folder: true,
            log_dir: String::new(),
            log_rotation_size: 5,
            log_rotation_unit: "mb".into(),
            shortcut_overrides: HashMap::new(),
            ai_model: "gpt-5.6-luna".into(),
            ai_effort: "medium".into(),
            transcription_provider: "openai".into(),
            transcription_endpoint: "https://api.openai.com/v1".into(),
            transcription_model: "whisper-1".into(),
            transcription_language: "ko".into(),
            silence_threshold_db: -35.0,
            silence_min_duration_ms: 450,
            silence_padding_ms: 120,
        }
    }
}

#[derive(Default)]
pub struct PlaybackSettingsGate {
    state: Mutex<PlaybackGateState>,
    idle: Condvar,
}

#[derive(Default)]
pub(crate) struct PlaybackGateState {
    settings: usize,
    attaching: bool,
}

#[derive(Clone, Copy)]
pub(crate) enum PlaybackLease {
    Settings,
    Attach,
}

impl PlaybackSettingsGate {
    pub(crate) fn enter(&self) -> PlaybackSettingsGuard<'_> {
        let mut state = self.state.lock().unwrap();
        while state.attaching {
            state = self.idle.wait(state).unwrap();
        }
        state.settings += 1;
        PlaybackSettingsGuard {
            gate: self,
            lease: PlaybackLease::Settings,
        }
    }

    pub(crate) fn enter_attach(&self) -> PlaybackSettingsGuard<'_> {
        let mut state = self.state.lock().unwrap();
        while state.settings != 0 || state.attaching {
            state = self.idle.wait(state).unwrap();
        }
        state.attaching = true;
        PlaybackSettingsGuard {
            gate: self,
            lease: PlaybackLease::Attach,
        }
    }

    pub(crate) fn wait(&self) {
        let mut state = self.state.lock().unwrap();
        while state.settings != 0 || state.attaching {
            state = self.idle.wait(state).unwrap();
        }
    }
}

pub(crate) struct PlaybackSettingsGuard<'a> {
    gate: &'a PlaybackSettingsGate,
    lease: PlaybackLease,
}

impl Drop for PlaybackSettingsGuard<'_> {
    fn drop(&mut self) {
        let mut state = self.gate.state.lock().unwrap();
        match self.lease {
            PlaybackLease::Settings => state.settings -= 1,
            PlaybackLease::Attach => state.attaching = false,
        }
        self.gate.idle.notify_all();
    }
}

pub(crate) enum PlaybackRollback {
    None,
    Video,
    Guides(Guides),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PlaybackChange {
    None,
    Video,
    Guides,
}

pub(crate) fn playback_change(
    before: &Settings,
    after: &Settings,
    has_unconfirmed_settings: bool,
) -> PlaybackChange {
    if has_unconfirmed_settings || playback_video_settings_changed(before, after) {
        PlaybackChange::Video
    } else if playback_guides_changed(before, after) {
        PlaybackChange::Guides
    } else {
        PlaybackChange::None
    }
}

pub(crate) fn restore_confirmed_playback(
    latest: &AtomicU64,
    generation: u64,
    session: Option<&Arc<Session>>,
    rollback: &PlaybackRollback,
) -> Option<String> {
    match (session, rollback) {
        (Some(session), PlaybackRollback::Video) => {
            restore_if_current(latest, generation, || {
                // Read at rollback time. An automatic proxy refresh may have
                // updated the confirmed paths while this settings candidate
                // was building, and the unpersisted candidate never changes
                // the confirmed snapshot.
                session.reconfigure(generation, session.confirmed_config())?;
                session.confirm_settings_generation(generation);
                Ok(())
            })
        }
        (Some(session), PlaybackRollback::Guides(guides)) => {
            restore_if_current(latest, generation, || {
                session.set_guides(generation, *guides)?;
                session.confirm_settings_generation(generation);
                Ok(())
            })
        }
        _ => None,
    }
}

pub(crate) fn restore_if_current(
    latest: &AtomicU64,
    generation: u64,
    restore: impl FnOnce() -> Result<(), String>,
) -> Option<String> {
    if latest.load(Ordering::Relaxed) != generation {
        return None;
    }
    match restore() {
        Ok(()) => None,
        Err(_) if latest.load(Ordering::Relaxed) != generation => None,
        Err(reason) => Some(reason),
    }
}

pub(crate) fn playback_settings_error(error: String, rollback_error: Option<String>) -> String {
    match rollback_error {
        Some(reason) => format!(
            "{error}; the saved setting was kept, but restoring playback also failed: {reason}"
        ),
        None => error,
    }
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Result<Bootstrap, String> {
    let _playback_settings = state.playback_settings.enter();
    let session = playback_session(&state);
    let generation = {
        let _commit = state.settings_transaction.lock().unwrap();
        let generation = state.settings_generation.fetch_add(1, Ordering::Relaxed) + 1;
        if let Some(session) = session.as_ref() {
            session.reserve_settings_generation(generation);
        }
        generation
    };
    let before = state.settings.lock().unwrap().clone();
    let change = if let Some(session) = session.as_ref() {
        playback_change(&before, &settings, session.has_unconfirmed_settings())
    } else {
        PlaybackChange::None
    };
    let rollback = match (session.as_ref(), change) {
        (Some(_), PlaybackChange::Video) => PlaybackRollback::Video,
        (Some(session), PlaybackChange::Guides) => {
            PlaybackRollback::Guides(session.confirmed_config().guides)
        }
        _ => PlaybackRollback::None,
    };

    if let Err(error) = crate::store::prepare_log_dir(&app, &settings) {
        let rollback_error = restore_confirmed_playback(
            &state.settings_generation,
            generation,
            session.as_ref(),
            &rollback,
        );
        return Err(playback_settings_error(error, rollback_error));
    }

    let apply = if let Some(session) = session.as_ref() {
        if change == PlaybackChange::Video {
            let graphics_changed = before.compositor != settings.compositor
                || before.gpu_device != settings.gpu_device;
            let new_config = if graphics_changed {
                explicit_playback_config(&app, &state, &settings)
            } else {
                automatic_playback_config(&app, &state, &settings)
            };
            new_config.and_then(|config| session.reconfigure(generation, config).map(|_| ()))
        } else if change == PlaybackChange::Guides {
            session
                .set_guides(generation, playback_guides(&settings))
                .map(|_| ())
        } else {
            Ok(())
        }
    } else {
        Ok(())
    };
    if let Err(error) = apply {
        let rollback_error = restore_confirmed_playback(
            &state.settings_generation,
            generation,
            session.as_ref(),
            &rollback,
        );
        return Err(playback_settings_error(error, rollback_error));
    }

    if state.settings_generation.load(Ordering::Relaxed) != generation {
        return Err("a newer settings change superseded this one".into());
    }
    let transaction = state.settings_transaction.lock().unwrap();
    if state.settings_generation.load(Ordering::Relaxed) != generation {
        return Err("a newer settings change superseded this one".into());
    }
    if let Err(error) = crate::store::save_settings(&app, &settings) {
        let rollback_error = restore_confirmed_playback(
            &state.settings_generation,
            generation,
            session.as_ref(),
            &rollback,
        );
        return Err(playback_settings_error(error, rollback_error));
    }
    if change != PlaybackChange::None {
        let session = session
            .as_ref()
            .expect("a playback change only exists with an active session");
        session.confirm_settings_generation(generation);
    }

    apply_theme(&app, &settings.theme);
    {
        let mut current = state.settings.lock().unwrap();
        // Pointing at a different ffmpeg means a different set of encoders, so
        // the cached answer is about the wrong binary.
        if current.ffmpeg_dir != settings.ffmpeg_dir {
            *state.accel.lock().unwrap() = None;
        }
        *current = settings;
    }
    let response = bootstrap(app, state.clone());
    drop(transaction);
    Ok(response)
}
