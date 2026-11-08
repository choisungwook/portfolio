use super::*;

/// One candidate and what happened when it was actually tried. Kept so Settings
/// can say why there is no hardware encoder instead of just saying there is
/// none.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriedCandidate {
    pub label: String,
    pub encoder: String,
    pub works: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccelProbe {
    /// The first candidate whose trial encode succeeded.
    pub available: Option<Acceleration>,
    pub tried: Vec<TriedCandidate>,
}

pub(crate) fn run_text(program: &str, args: Vec<String>) -> String {
    Command::new(program)
        .args(args)
        .output()
        .map(|out| {
            let mut text = String::from_utf8_lossy(&out.stdout).to_string();
            text.push_str(&String::from_utf8_lossy(&out.stderr));
            text
        })
        .unwrap_or_default()
}

/// Which hardware encoder this machine can really use.
///
/// `ffmpeg -encoders` only says what ffmpeg was built with — a Homebrew build
/// lists h264_nvenc on a Mac that has never seen an NVIDIA card. So the listing
/// picks the candidates and a one frame encode decides, which costs about 50 ms
/// each and is the whole difference between knowing and guessing.
pub(crate) fn detect_acceleration(program: &str) -> AccelProbe {
    let encoders = accel::parse_encoders(&run_text(program, accel::encoders_args()));
    let hwaccels = accel::parse_hwaccels(&run_text(program, accel::hwaccels_args()));

    let mut tried = Vec::new();
    let mut available = None;
    for candidate in accel::candidates(&encoders, &hwaccels) {
        let output = Command::new(program)
            .args(accel::trial_args(&candidate.encoder))
            .output();
        let (works, note) = match output {
            Ok(out) if out.status.success() => (true, String::new()),
            Ok(out) => (
                false,
                String::from_utf8_lossy(&out.stderr)
                    .lines()
                    .next()
                    .unwrap_or("the trial encode failed")
                    .to_string(),
            ),
            Err(error) => (false, error.to_string()),
        };
        tried.push(TriedCandidate {
            label: candidate.label.clone(),
            encoder: candidate.encoder.clone(),
            works,
            note,
        });
        if works && available.is_none() {
            available = Some(candidate);
        }
    }
    AccelProbe { available, tried }
}

/// Cached for the life of the app: the answer costs subprocesses and cannot
/// change while it is running.
pub(crate) fn acceleration(state: &State<AppState>, program: Option<&String>) -> AccelProbe {
    if let Some(cached) = state.accel.lock().unwrap().as_ref() {
        return cached.clone();
    }
    let probe = match program {
        Some(program) => detect_acceleration(program),
        None => AccelProbe {
            available: None,
            tried: Vec::new(),
        },
    };
    // Nothing was detected because ffmpeg is missing, so do not cache it: the
    // user may point Settings at it and expect the next render to pick it up.
    if program.is_some() {
        *state.accel.lock().unwrap() = Some(probe.clone());
    }
    probe
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompositorInfo {
    /// "auto", "cpu" or "ffmpeg", as asked for.
    pub setting: String,
    /// What is actually drawing: a device name, or "software (CPU)".
    pub device: String,
    /// Whether that is a graphics device rather than the software path.
    pub gpu: bool,
    /// True when a graphics device was wanted and there was none, so the
    /// software compositor took over. The picture is the same either way.
    pub fell_back: bool,
}

/// CPU and GPU composition both use the persistent native monitor. The CPU
/// path uploads one finished RGBA layer through a presentation-only GPU; media
/// elements are only the startup fallback when no native presenter exists.
pub(crate) fn wanted_engine(_settings: &Settings) -> &'static str {
    "native"
}

/// Whether the setting asks to stay off the graphics device.
///
/// One test, used everywhere the choice matters, so the three things the
/// setting decides cannot drift apart. Only "cpu" is cpu; "gpu", the "auto" and
/// "ffmpeg" older settings files hold, and anything unrecognised all mean the
/// graphics device.
pub(crate) fn stays_on_cpu(settings: &Settings) -> bool {
    settings.compositor == "cpu"
}

/// Which backend a setting asks for. Auto rather than Gpu on purpose: a machine
/// with no device should quietly use the software path, not refuse to draw.
pub(crate) fn wanted_backend(setting: &str) -> Backend {
    if setting == "cpu" {
        Backend::Cpu
    } else {
        Backend::Auto
    }
}

pub(crate) fn explicit_playback_backend(settings: &Settings) -> Backend {
    if stays_on_cpu(settings) {
        Backend::Cpu
    } else {
        Backend::Gpu
    }
}

pub(crate) fn automatic_playback_backend(settings: &Settings) -> Backend {
    wanted_backend(&settings.compositor)
}

/// The adapter name a setting asks for, or `None` for whatever wgpu picks.
pub(crate) fn wanted_device(setting: &str) -> Option<&str> {
    let name = setting.trim();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// The compositor for a backend, made once and shared. This never fails: with
/// no graphics device the software compositor draws the same picture, only
/// slower, so "no GPU" stopped being a reason to give up.
pub(crate) fn compositor(state: &State<AppState>, backend: Backend, device: Option<&str>) -> Arc<Compositor> {
    let key = (backend, device.unwrap_or_default().to_string());
    let mut made = state.compositor.lock().unwrap();
    if let Some((_, existing)) = made.iter().find(|(kind, _)| *kind == key) {
        return Arc::clone(existing);
    }
    if let Some(existing) = made
        .iter()
        .find(|(cached, existing)| {
            lenient_cache_matches(
                backend,
                device,
                cached,
                existing.is_gpu(),
                existing.adapter(),
            )
        })
        .map(|(_, existing)| Arc::clone(existing))
    {
        made.push((key, Arc::clone(&existing)));
        return existing;
    }
    let built =
        Arc::new(Compositor::with_device(backend, device).unwrap_or_else(|_| Compositor::new()));
    made.push((key, Arc::clone(&built)));
    built
}

/// A playback compositor that honours an explicit choice. Unlike the general
/// preview/render helper above, a named GPU that is absent is an error: a live
/// reconfiguration must roll back instead of silently moving to another card.
pub(crate) fn strict_compositor(
    state: &State<AppState>,
    backend: Backend,
    device: Option<&str>,
) -> Result<Arc<Compositor>, String> {
    let mut made = state.compositor.lock().unwrap();
    // Cache keys describe what originally requested a compositor, not what
    // adapter it actually opened. Reuse an Auto compositor that already owns
    // the requested GPU so a no-op explicit choice stays the same Arc and the
    // native surface keeps its zero-copy path.
    if let Some(existing) = made
        .iter()
        .find(|(cached, existing)| {
            strict_cache_matches(
                backend,
                device,
                cached,
                existing.is_gpu(),
                existing.adapter(),
            )
        })
        .map(|(_, existing)| Arc::clone(existing))
    {
        validate_strict_compositor(backend, device, &existing)?;
        let key = (backend, device.unwrap_or_default().to_string());
        if !made.iter().any(|(cached, _)| *cached == key) {
            made.push((key, Arc::clone(&existing)));
        }
        return Ok(existing);
    }
    let built = Arc::new(Compositor::with_device(backend, device)?);
    validate_strict_compositor(backend, device, &built)?;
    let key = (backend, device.unwrap_or_default().to_string());
    made.push((key, Arc::clone(&built)));
    Ok(built)
}

pub(crate) fn lenient_cache_matches(
    backend: Backend,
    device: Option<&str>,
    cached: &(Backend, String),
    is_gpu: bool,
    adapter: &str,
) -> bool {
    match (backend, device) {
        (Backend::Auto, Some(name)) => is_gpu && adapter == name,
        (Backend::Auto, None) => is_gpu && cached.1.is_empty() && cached.0 == Backend::Gpu,
        (Backend::Gpu, Some(name)) => is_gpu && adapter == name,
        (Backend::Gpu, None) => is_gpu && cached.1.is_empty(),
        (Backend::Cpu, None) => !is_gpu,
        (Backend::Cpu, Some(_)) => false,
    }
}

pub(crate) fn strict_cache_matches(
    backend: Backend,
    device: Option<&str>,
    cached: &(Backend, String),
    is_gpu: bool,
    adapter: &str,
) -> bool {
    match (backend, device) {
        (Backend::Gpu, Some(name)) => is_gpu && adapter == name,
        (Backend::Gpu, None) => is_gpu && cached.1.is_empty(),
        (Backend::Cpu, None) => !is_gpu,
        _ => false,
    }
}

pub(crate) fn validate_strict_compositor(
    backend: Backend,
    device: Option<&str>,
    compositor: &Compositor,
) -> Result<(), String> {
    if backend == Backend::Gpu && !compositor.is_gpu() {
        return Err("the requested graphics compositor is not available".into());
    }
    if backend == Backend::Cpu && compositor.is_gpu() {
        return Err("the requested CPU compositor is not available".into());
    }
    if let Some(name) = device {
        if name != compositor.adapter() {
            return Err(format!(
                "graphics device `{name}` is not available; the current setting was kept"
            ));
        }
    }
    Ok(())
}

/// The compositor the settings ask for.
pub(crate) fn settings_compositor(state: &State<AppState>, settings: &Settings) -> Arc<Compositor> {
    compositor(
        state,
        wanted_backend(&settings.compositor),
        wanted_device(&settings.gpu_device),
    )
}

/// Every graphics adapter this machine offers, for the settings list.
///
/// Asked for by the page rather than sent with the bootstrap: enumerating
/// adapters opens the graphics stack, and an app that never draws on a GPU
/// should not do that on the way up.
#[tauri::command]
pub fn graphics_devices() -> Vec<makevideo_compositor::gpu::Device> {
    makevideo_compositor::gpu::devices()
}

pub(crate) fn compositor_info(state: &State<AppState>, settings: &Settings) -> CompositorInfo {
    // Normalised, so the page never has to know that a settings file may still
    // hold "auto" or "ffmpeg".
    let setting = if stays_on_cpu(settings) { "cpu" } else { "gpu" }.to_string();
    let backend = wanted_backend(&settings.compositor);
    let made = settings_compositor(state, settings);
    // A name that is not on this machine is drawn on the automatic pick, and
    // the note has to say so rather than repeat the setting back.
    let asked_for = wanted_device(&settings.gpu_device);
    CompositorInfo {
        setting,
        device: made.adapter().to_string(),
        gpu: made.is_gpu(),
        fell_back: (backend == Backend::Auto && !made.is_gpu())
            || asked_for.is_some_and(|name| name != made.adapter()),
    }
}

/// What this render should use, honouring the setting.
pub(crate) fn chosen_acceleration(app: &AppHandle, state: &State<AppState>) -> Option<Acceleration> {
    let settings = state.settings.lock().unwrap().clone();
    if settings.render_acceleration == "cpu" {
        return None;
    }
    let program = find_tool(app, "ffmpeg", &settings.ffmpeg_dir);
    acceleration(state, program.as_ref()).available
}
