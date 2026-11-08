use super::*;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenderProgress {
    position_ms: u64,
    total_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenderDone {
    ok: bool,
    cancelled: bool,
    path: String,
    message: String,
    /// The hardware attempt failed and the CPU finished the job.
    fell_back: bool,
    /// What did the encoding, empty when it was the CPU.
    accelerator: String,
    /// The timeline was edited while this was running, so the file is the
    /// timeline as it stood when the render started. This is what the revision
    /// number is for: without it the app would have to either refuse to edit
    /// during a render or quietly let somebody believe the output matches what
    /// is on screen.
    edited: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenderFallback {
    from: String,
}

/// ffmpeg's own error text, trimmed to something a dialog can hold.
pub(crate) fn tail(text: &str) -> String {
    let trimmed = text.trim();
    match trimmed.char_indices().nth_back(2000) {
        Some((index, _)) => format!("…{}", &trimmed[index..]),
        None => trimmed.to_string(),
    }
}

pub(crate) struct Outcome {
    ok: bool,
    cancelled: bool,
    message: String,
}

/// Runs ffmpeg to completion, emitting progress as it goes. Blocks, so it is
/// only ever called from the render thread.
pub(crate) fn run_ffmpeg(
    app: &AppHandle,
    shared: &Arc<Mutex<Option<Child>>>,
    cancelled: &Arc<AtomicBool>,
    program: &str,
    args: &[String],
    total_ms: u64,
) -> Outcome {
    let spawned = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match spawned {
        Ok(child) => child,
        Err(error) => {
            return Outcome {
                ok: false,
                cancelled: false,
                message: format!("cannot start {program}: {error}"),
            }
        }
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *shared.lock().unwrap() = Some(child);

    // stderr has to be drained even when nobody reads it, or a chatty failure
    // fills the pipe and ffmpeg blocks on a write that never completes.
    let errors = Arc::new(Mutex::new(String::new()));
    let drain = stderr.map(|mut stderr| {
        let errors = Arc::clone(&errors);
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.read_to_string(&mut text);
            *errors.lock().unwrap() = text;
        })
    });

    if let Some(stdout) = stdout {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(ffmpeg::Progress::Position(position_ms)) =
                ffmpeg::parse_progress_line(&line)
            {
                let _ = app.emit(
                    "render:progress",
                    RenderProgress {
                        position_ms: position_ms.min(total_ms),
                        total_ms,
                    },
                );
            }
        }
    }
    // The pipe closed, so ffmpeg has either finished or been killed.
    let status = shared
        .lock()
        .unwrap()
        .take()
        .and_then(|mut child| child.wait().ok());
    if let Some(handle) = drain {
        let _ = handle.join();
    }

    let was_cancelled = cancelled.load(Ordering::SeqCst);
    let ok = !was_cancelled && status.map(|status| status.success()).unwrap_or(false);
    let message = if ok {
        String::new()
    } else if was_cancelled {
        "Render cancelled.".into()
    } else {
        let text = errors.lock().unwrap().clone();
        if text.trim().is_empty() {
            "ffmpeg stopped without writing the file.".into()
        } else {
            tail(&text)
        }
    };
    Outcome {
        ok,
        cancelled: was_cancelled,
        message,
    }
}

/// How one attempt at a render turned out.
pub(crate) enum Attempt {
    Done,
    Cancelled,
    Failed(String),
}

/// One way of producing the file. The composited route draws every frame with
/// the same shader the preview uses; the graph route leaves the picture inside
/// ffmpeg and is faster because the frames never cross a pipe.
pub(crate) enum Route {
    Composited {
        label: String,
        accel: Option<Acceleration>,
    },
    Graph {
        label: String,
        args: Vec<String>,
    },
}

impl Route {
    pub(crate) fn label(&self) -> &str {
        match self {
            Route::Composited { label, .. } | Route::Graph { label, .. } => label,
        }
    }
}

/// Starts a render and returns as soon as it is under way. Progress arrives as
/// `render:progress` events and the outcome as one `render:done`.
///
/// The rasterized text and shape stills for one render. The directory lives
/// exactly as long as this value: dropping it — after the last route, or on
/// the error path before any — removes the files.
pub(crate) struct VisualStills {
    dir: PathBuf,
    inputs: Vec<ffmpeg::VisualInput>,
}

impl Drop for VisualStills {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// Rasterize every text and shape item at the output size and write each as a
/// PAM still for the filter graph to overlay. None when the project has no
/// visual items, which is also no temp directory.
pub(crate) fn write_visual_stills(
    project: &Project,
    preset: ffmpeg::Preset,
) -> Result<Option<VisualStills>, String> {
    let (width, height) = ffmpeg::output_size(&project.settings, preset);
    let rasters = makevideo_compositor::text::item_rasters(project, width, height);
    if rasters.is_empty() {
        return Ok(None);
    }
    // A counter beside the pid, because two renders from one app run must not
    // share a directory the first one deletes.
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "akbun-makevideo-visuals-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::SeqCst)
    ));
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("cannot prepare the text and shape overlays: {error}"))?;
    // Built before the writes, so a failed write still removes the directory.
    let mut stills = VisualStills {
        dir,
        inputs: Vec::new(),
    };
    for (index, raster) in rasters.iter().enumerate() {
        let path = stills.dir.join(format!("visual-{index}.pam"));
        makevideo_compositor::text::write_pam(&path, &raster.pixels, raster.width, raster.height)
            .map_err(|error| format!("cannot write a text and shape overlay: {error}"))?;
        stills.inputs.push(ffmpeg::VisualInput {
            path: path.to_string_lossy().into_owned(),
            x: raster.x,
            y: raster.y,
            opacity: raster.opacity,
            start_frame: raster.start_frame,
            end_frame: raster.end_frame,
        });
    }
    Ok(Some(stills))
}

/// Everything that can fail on a bad project is built here, synchronously, so
/// the dialog never opens on a render that was never going to start. Each route
/// is then tried in turn: anything that fails without being cancelled falls
/// back to the plain ffmpeg filter graph on the CPU, which is the combination
/// with the fewest moving parts.
#[tauri::command]
pub fn start_render(
    app: AppHandle,
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
    path: String,
    preset: String,
    quality: Option<String>,
) -> Result<(), String> {
    let preset = parse_preset(&preset, quality.as_deref())?;
    let snapshot = {
        let document = state.document.lock().unwrap();
        (document.project().clone(), document.revision())
    };
    render_snapshot(app, state, ai_runtime, path, preset, snapshot)
}

/// The render request as the page and the MCP bridge send it: a resolution
/// name and an optional quality, Medium when left out.
pub(crate) fn parse_preset(preset: &str, quality: Option<&str>) -> Result<ffmpeg::Preset, String> {
    let quality = ffmpeg::Quality::parse(quality.unwrap_or("medium"))?;
    Ok(ffmpeg::Preset::parse(preset)?.with_quality(quality))
}

pub(crate) fn render_snapshot(
    app: AppHandle,
    state: State<AppState>,
    ai_runtime: State<'_, crate::ai_edit::AiEditRuntime>,
    path: String,
    preset: ffmpeg::Preset,
    snapshot: (Project, u64),
) -> Result<(), String> {
    crate::ai_edit::ensure_editable(&ai_runtime)?;
    if state.render.lock().unwrap().is_some() {
        return Err("a render is already running".into());
    }
    let (project, started_at) = snapshot;
    // Only the progress bar wants this; every decision below is in frames.
    let total_ms = project.duration().to_millis().max(0) as u64;
    let settings = state.settings.lock().unwrap().clone();
    let program = find_tool(&app, "ffmpeg", &settings.ffmpeg_dir).ok_or_else(|| {
        "ffmpeg was not found. Install it with `brew install ffmpeg`, or point Settings at the \
         folder that holds it."
            .to_string()
    })?;

    let chosen = chosen_acceleration(&app, &state);
    let accel_label = chosen
        .as_ref()
        .map(|hardware| hardware.label.clone())
        .unwrap_or_else(|| "CPU".into());
    let dynamic_paint = project.uses_video_paint();
    // On the CPU setting the filter graph normally draws, because putting a
    // whole render through the software compositor is much slower. A video
    // paint is different: it changes every frame, so it must use that
    // compositor instead of turning one raster into a frozen overlay still.
    let gpu = if stays_on_cpu(&settings) {
        if dynamic_paint {
            Some(strict_compositor(&state, Backend::Cpu, None)?)
        } else {
            None
        }
    } else {
        Some(settings_compositor(&state, &settings))
    };

    // The graph routes cannot draw text, so each visual item is rasterized
    // once — the same pixels the compositor composites — and handed to the
    // graph as an overlay input. Written even when the composited route goes
    // first: the fallback runs after a failure, which is the wrong moment to
    // start writing files.
    makevideo_compositor::text::set_ffmpeg_path(&program);
    let visual_dir = if dynamic_paint {
        None
    } else {
        write_visual_stills(&project, preset)?
    };
    let visuals = visual_dir
        .as_ref()
        .map(|prepared| prepared.inputs.clone())
        .unwrap_or_default();

    let mut routes: Vec<Route> = Vec::new();
    let built = (|| -> Result<(), String> {
        if let Some(gpu) = gpu.as_ref() {
            // Validated now so a broken project fails before the sheet opens.
            ffmpeg::encoder_args(&project, &path, preset, chosen.as_ref())?;
            routes.push(Route::Composited {
                label: format!("{} compositor, {accel_label} encoder", gpu.adapter()),
                accel: chosen.clone(),
            });
        } else if let Some(hardware) = chosen.as_ref() {
            routes.push(Route::Graph {
                label: format!("ffmpeg filter graph, {accel_label} encoder"),
                args: ffmpeg::build_args(&project, &path, preset, Some(hardware), &visuals)?,
            });
        }
        // A filter graph only accepts static visual rasters. Do not turn a
        // failed dynamic render into a successful export with frozen paint.
        if !dynamic_paint {
            let plain = ffmpeg::build_args(&project, &path, preset, None, &visuals)?;
            routes.push(Route::Graph {
                label: "ffmpeg filter graph, CPU encoder".into(),
                args: plain,
            });
        }
        Ok(())
    })();
    if let Err(error) = built {
        drop(visual_dir);
        return Err(error);
    }

    state.cancelled.store(false, Ordering::SeqCst);
    let shared = Arc::clone(&state.render);
    let cancelled = Arc::clone(&state.cancelled);
    let document = Arc::clone(&state.document);

    std::thread::spawn(move || {
        // Holds the overlay stills on disk until the last route has run; the
        // fallback route reads them minutes after the render started.
        let _visual_dir = visual_dir;
        let mut fell_back = false;
        let mut used = String::new();
        let mut outcome = Attempt::Failed("no route was tried".into());

        for (index, route) in routes.iter().enumerate() {
            if index > 0 {
                fell_back = true;
                let _ = app.emit(
                    "render:fallback",
                    RenderFallback {
                        from: routes[index - 1].label().to_string(),
                    },
                );
            }
            used = route.label().to_string();
            outcome = match route {
                Route::Composited { accel, .. } => {
                    let gpu = gpu.as_ref().expect("a composited route needs a device");
                    let emit = |position_ms: u64, total: u64| {
                        let _ = app.emit(
                            "render:progress",
                            RenderProgress {
                                position_ms,
                                total_ms: total,
                            },
                        );
                    };
                    match makevideo_compositor::pipeline::run(
                        gpu,
                        makevideo_compositor::pipeline::Options {
                            ffmpeg: &program,
                            project: &project,
                            output: &path,
                            preset,
                            accel: accel.as_ref(),
                        },
                        &shared,
                        &cancelled,
                        emit,
                    ) {
                        Ok(()) => Attempt::Done,
                        Err(error) if cancelled.load(Ordering::SeqCst) => {
                            let _ = error;
                            Attempt::Cancelled
                        }
                        Err(error) => Attempt::Failed(error),
                    }
                }
                Route::Graph { args, .. } => {
                    let result = run_ffmpeg(&app, &shared, &cancelled, &program, args, total_ms);
                    if result.cancelled {
                        Attempt::Cancelled
                    } else if result.ok {
                        Attempt::Done
                    } else {
                        Attempt::Failed(result.message)
                    }
                }
            };
            if matches!(outcome, Attempt::Done | Attempt::Cancelled) {
                break;
            }
        }

        cancelled.store(false, Ordering::SeqCst);
        let (ok, was_cancelled, message) = match outcome {
            Attempt::Done => (true, false, String::new()),
            Attempt::Cancelled => (false, true, "Render cancelled.".to_string()),
            Attempt::Failed(error) => (false, false, tail(&error)),
        };
        let _ = app.emit(
            "render:done",
            RenderDone {
                ok,
                cancelled: was_cancelled,
                path,
                message,
                fell_back: fell_back && ok,
                accelerator: if ok { used } else { String::new() },
                edited: ok && document.lock().unwrap().revision() != started_at,
            },
        );
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_render(state: State<AppState>) {
    state.cancelled.store(true, Ordering::SeqCst);
    if let Some(child) = state.render.lock().unwrap().as_mut() {
        let _ = child.kill();
    }
}
