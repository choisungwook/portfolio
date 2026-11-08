use super::*;

pub(crate) fn probe_proxy_source(ffprobe: &str, path: &str) -> makevideo_proxy::SourceProbe {
    let Ok(output) = Command::new(ffprobe)
        .args(makevideo_proxy::probe_args(path))
        .output()
    else {
        return makevideo_proxy::SourceProbe::default();
    };
    makevideo_proxy::parse_probe(&String::from_utf8_lossy(&output.stdout))
}

pub(crate) const PROXY_PROBE_CONCURRENCY: usize = 4;

pub(crate) async fn assess_proxy_assets(
    ffprobe_path: String,
    assets: Vec<Asset>,
) -> Result<Vec<(Asset, makevideo_proxy::Assessment)>, String> {
    let mut assessed = Vec::with_capacity(assets.len());
    for batch in assets.chunks(PROXY_PROBE_CONCURRENCY) {
        let mut probes = Vec::with_capacity(batch.len());
        for asset in batch.iter().cloned() {
            let ffprobe_path = ffprobe_path.clone();
            probes.push(tauri::async_runtime::spawn_blocking(move || {
                let source = probe_proxy_source(&ffprobe_path, &asset.path);
                let assessment = makevideo_proxy::assess(&asset, &source);
                (asset, assessment)
            }));
        }
        for probe in probes {
            assessed.push(
                probe
                    .await
                    .map_err(|error| format!("the proxy inspection job did not finish: {error}"))?,
            );
        }
    }
    Ok(assessed)
}

/// Files dropped on the window or picked in the dialog. Anything whose
/// extension is not media is skipped rather than imported as a broken row.
///
/// A file whose length ffprobe could not report comes back with durationMs 0;
/// the page fills it in from the media element once it loads, so the app still
/// works with no ffmpeg installed right up to the point of rendering.
#[tauri::command]
pub async fn import_assets(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<Asset>, String> {
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    blocking(move || import_assets_blocking(&app, &configured, paths)).await
}

/// One ffprobe per file, so this belongs on a blocking thread. The MCP bridge
/// already runs on one and calls it directly.
pub(crate) fn import_assets_blocking(app: &AppHandle, configured: &str, paths: Vec<String>) -> Vec<Asset> {
    let ffprobe = find_tool(app, "ffprobe", configured);
    let mut assets = Vec::new();
    for path in paths {
        let Some(kind) = AssetKind::from_path(&path) else {
            continue;
        };
        if !Path::new(&path).is_file() {
            continue;
        }
        allow_asset_file(app, &path);
        let probed = probe_asset(ffprobe.as_ref(), &path);
        assets.push(Asset {
            id: makevideo_render::asset_id(&path),
            name: Path::new(&path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone()),
            kind,
            duration_ms: probed.duration_ms,
            width: probed.width,
            height: probed.height,
            has_audio: probed.has_audio,
            path,
        });
    }
    assets
}

pub(crate) fn set_proxy_status(
    app: &AppHandle,
    proxies: &Arc<Mutex<ProxyState>>,
    project_path: &str,
    status: ProxyStatus,
) -> bool {
    let mut current = proxies.lock().unwrap();
    if current.project_path != project_path {
        return false;
    }
    current.entries.insert(status.asset_id.clone(), status);
    drop(current);
    emit_proxy_status(app, proxies);
    true
}

pub(crate) fn make_proxy(
    app: &AppHandle,
    proxies: &Arc<Mutex<ProxyState>>,
    project_path: &str,
    ffmpeg_path: &str,
    asset: &Asset,
    codecs: makevideo_proxy::Codecs,
    reason: &str,
) -> Result<String, String> {
    let output = makevideo_proxy::media_path(project_path, &asset.id)?;
    let temporary = output.with_extension("part.mp4");
    let args = makevideo_proxy::ffmpeg_args(asset, &temporary, codecs);
    let mut child = Command::new(ffmpeg_path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("cannot start ffmpeg: {error}"))?;
    let done = Arc::new(AtomicBool::new(false));
    let progress = Arc::new(AtomicU8::new(0));
    let monitor = monitor_proxy_playback(
        app.clone(),
        child.id(),
        Arc::clone(&done),
        Arc::clone(proxies),
        project_path.to_string(),
        asset.id.clone(),
        reason.to_string(),
        Arc::clone(&progress),
    );
    if let Some(stdout) = child.stdout.take() {
        let mut last_percent = 0;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(ffmpeg::Progress::Position(position_ms)) =
                ffmpeg::parse_progress_line(&line)
            {
                let percent = if asset.duration_ms > 0 {
                    ((position_ms.min(asset.duration_ms) * 100) / asset.duration_ms) as u8
                } else {
                    0
                };
                if !makevideo_proxy::progress_percent_changed(&mut last_percent, percent) {
                    continue;
                }
                progress.store(percent, Ordering::Relaxed);
                if !set_proxy_status(
                    app,
                    proxies,
                    project_path,
                    proxy_status_entry(&asset.id, "generating", percent, "", reason, ""),
                ) {
                    let _ = child.kill();
                    let _ = child.wait();
                    done.store(true, Ordering::Relaxed);
                    let _ = monitor.join();
                    return Err("the project changed".into());
                }
            }
        }
    }
    let status = child.wait();
    done.store(true, Ordering::Relaxed);
    let _ = monitor.join();
    let status = status.map_err(|error| error.to_string())?;
    if !status.success() {
        let _ = std::fs::remove_file(&temporary);
        return Err("ffmpeg could not create the proxy".into());
    }
    if output.exists() {
        std::fs::remove_file(&output)
            .map_err(|error| format!("cannot replace {output:?}: {error}"))?;
    }
    std::fs::rename(&temporary, &output)
        .map_err(|error| format!("cannot move {temporary:?} to {output:?}: {error}"))?;
    makevideo_proxy::write_manifest(project_path, asset)?;
    Ok(output.to_string_lossy().to_string())
}

pub(crate) fn playback_is_running(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .playback
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|session| session.status().playing)
}

/// Jobs queued for proxying wait until playback stops. The waiting state is
/// emitted once so the page can explain why zero-percent work is not moving.
pub(crate) fn wait_for_playback_pause(
    app: &AppHandle,
    proxies: &Arc<Mutex<ProxyState>>,
    project_path: &str,
    asset_id: &str,
    reason: &str,
) -> Result<(), String> {
    let mut reported = false;
    loop {
        if !playback_is_running(app) {
            return Ok(());
        }
        if !reported {
            if !set_proxy_status(
                app,
                proxies,
                project_path,
                proxy_status_entry(
                    asset_id,
                    "waiting",
                    0,
                    "",
                    reason,
                    "playback is active; generation starts after playback stops",
                ),
            ) {
                return Err("the project changed".into());
            }
            reported = true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// An encoder that was already running is suspended while playback owns the
/// decode budget. Its state and last percentage stay visible until it resumes.
#[allow(clippy::too_many_arguments)]
pub(crate) fn monitor_proxy_playback(
    app: AppHandle,
    pid: u32,
    done: Arc<AtomicBool>,
    proxies: Arc<Mutex<ProxyState>>,
    project_path: String,
    asset_id: String,
    reason: String,
    progress: Arc<AtomicU8>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let mut proxy_paused = false;
        while !done.load(Ordering::Relaxed) {
            let should_pause_proxy = playback_is_running(&app);
            if should_pause_proxy != proxy_paused {
                let _ = set_proxy_process_paused(pid, should_pause_proxy);
                proxy_paused = should_pause_proxy;
                let state = if proxy_paused { "paused" } else { "generating" };
                let message = if proxy_paused {
                    "playback is active; generation resumes after playback stops"
                } else {
                    ""
                };
                let _ = set_proxy_status(
                    &app,
                    &proxies,
                    &project_path,
                    proxy_status_entry(
                        &asset_id,
                        state,
                        progress.load(Ordering::Relaxed),
                        "",
                        &reason,
                        message,
                    ),
                );
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if proxy_paused {
            let _ = set_proxy_process_paused(pid, false);
        }
    })
}

#[cfg(unix)]
pub(crate) fn set_proxy_process_paused(pid: u32, paused: bool) -> Result<(), String> {
    let signal = if paused { libc::SIGSTOP } else { libc::SIGCONT };
    let result = unsafe { libc::kill(pid as libc::pid_t, signal) };
    (result == 0)
        .then_some(())
        .ok_or_else(|| std::io::Error::last_os_error().to_string())
}

#[cfg(not(unix))]
pub(crate) fn set_proxy_process_paused(_: u32, _: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn proxy_status(state: State<AppState>) -> Vec<ProxyStatus> {
    proxy_statuses(&state.proxies.lock().unwrap())
}

#[tauri::command]
pub async fn start_proxies(
    app: AppHandle,
    state: State<'_, AppState>,
    project_path: String,
) -> Result<Vec<ProxyStatus>, String> {
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let ffmpeg_path = find_tool(&app, "ffmpeg", &configured)
        .ok_or("ffmpeg was not found, so proxies cannot be created")?;
    let ffprobe_path = find_tool(&app, "ffprobe", &configured)
        .ok_or("ffprobe was not found, so proxy media cannot be assessed")?;
    let acceleration = acceleration(&state, Some(&ffmpeg_path)).available;
    let project = state.document.lock().unwrap().project().clone();
    let video_assets = project
        .assets
        .iter()
        .filter(|asset| asset.kind == AssetKind::Video)
        .cloned()
        .collect::<Vec<_>>();
    {
        let mut proxies = state.proxies.lock().unwrap();
        if proxies.project_path != project_path {
            proxies.project_path = project_path.clone();
            proxies.entries.clear();
        }
        let video_asset_ids: HashSet<String> = video_assets
            .iter()
            .map(|asset| asset.id.clone())
            .collect();
        proxies.entries.retain(|id, _| video_asset_ids.contains(id));
        for asset in &video_assets {
            proxies.entries.entry(asset.id.clone()).or_insert_with(|| {
                proxy_status_entry(
                    &asset.id,
                    "inspecting",
                    0,
                    "",
                    "checking resolution, codec, and keyframe interval",
                    "",
                )
            });
        }
    }
    emit_proxy_status(&app, &state.proxies);

    let assessed = assess_proxy_assets(ffprobe_path, video_assets).await?;
    let mut jobs: Vec<(Asset, String)> = Vec::new();
    {
        let mut proxies = state.proxies.lock().unwrap();
        if proxies.project_path != project_path {
            return Ok(proxy_statuses(&proxies));
        }
        for (asset, assessment) in assessed {
            if matches!(
                proxies
                    .entries
                    .get(&asset.id)
                    .map(|status| status.state.as_str()),
                Some("queued" | "waiting" | "generating" | "paused")
            ) {
                continue;
            }
            if !assessment.needs_proxy {
                proxies.entries.insert(
                    asset.id.clone(),
                    proxy_status_entry(&asset.id, "original", 100, "", assessment.reason, ""),
                );
            } else if let Some(path) = makevideo_proxy::valid_proxy(&project_path, &asset) {
                allow_asset_file(&app, &path);
                proxies.entries.insert(
                    asset.id.clone(),
                    proxy_status_entry(&asset.id, "ready", 100, path, assessment.reason, ""),
                );
            } else {
                let reason = assessment.reason;
                proxies.entries.insert(
                    asset.id.clone(),
                    proxy_status_entry(&asset.id, "queued", 0, "", &reason, ""),
                );
                jobs.push((asset, reason));
            }
        }
    }
    emit_proxy_status(&app, &state.proxies);

    if !jobs.is_empty() {
        makevideo_proxy::order_by_first_use(&makevideo_proxy::first_use(&project), &mut jobs);
        let proxies = Arc::clone(&state.proxies);
        let worker = std::thread::spawn(move || {
            run_proxy_jobs(app, proxies, project_path, ffmpeg_path, acceleration, jobs)
        });
        let mut workers = state.proxy_workers.lock().unwrap();
        workers.retain(|worker| !worker.is_finished());
        workers.push(worker);
    }
    Ok(proxy_statuses(&state.proxies.lock().unwrap()))
}

/// Make queued proxies, several at once when a hardware encoder is there. The
/// queue is shared, so a job that finishes early takes the next asset rather
/// than waiting for a fixed half of the list.
pub(crate) fn run_proxy_jobs(
    app: AppHandle,
    proxies: Arc<Mutex<ProxyState>>,
    project_path: String,
    ffmpeg_path: String,
    acceleration: Option<makevideo_render::accel::Acceleration>,
    jobs: Vec<(Asset, String)>,
) {
    if let Ok(dir) = makevideo_proxy::proxy_dir(&project_path) {
        if let Err(error) = std::fs::create_dir_all(&dir) {
            for (asset, reason) in jobs {
                set_proxy_status(
                    &app,
                    &proxies,
                    &project_path,
                    proxy_status_entry(asset.id, "failed", 0, "", reason, error.to_string()),
                );
            }
            return;
        }
    }
    let codecs = makevideo_proxy::Codecs {
        encoder: acceleration.as_ref().map(|item| item.encoder.as_str()),
        hwaccel: acceleration.as_ref().and_then(|item| item.hwaccel.as_deref()),
    };
    let queue = Mutex::new(std::collections::VecDeque::from(jobs));
    // Set when the project changes under the jobs, so every worker stops.
    let stopped = AtomicBool::new(false);
    std::thread::scope(|scope| {
        for _ in 0..makevideo_proxy::concurrent_jobs(codecs) {
            scope.spawn(|| {
                while !stopped.load(Ordering::Relaxed) {
                    let Some((asset, reason)) = queue.lock().unwrap().pop_front() else {
                        return;
                    };
                    if !run_proxy_job(&app, &proxies, &project_path, &ffmpeg_path, codecs, asset, reason) {
                        stopped.store(true, Ordering::Relaxed);
                    }
                }
            });
        }
    });
}

/// One proxy from waiting to ready or failed. False means the project changed
/// and the remaining jobs belong to a project that is no longer open.
pub(crate) fn run_proxy_job(
    app: &AppHandle,
    proxies: &Arc<Mutex<ProxyState>>,
    project_path: &str,
    ffmpeg_path: &str,
    codecs: makevideo_proxy::Codecs,
    asset: Asset,
    reason: String,
) -> bool {
    if let Err(message) = wait_for_playback_pause(app, proxies, project_path, &asset.id, &reason) {
        if message == "the project changed" {
            return false;
        }
    }
    if !set_proxy_status(
        app,
        proxies,
        project_path,
        proxy_status_entry(&asset.id, "generating", 0, "", &reason, ""),
    ) {
        return false;
    }
    let status = match make_proxy(app, proxies, project_path, ffmpeg_path, &asset, codecs, &reason) {
        Ok(path) => {
            allow_asset_file(app, &path);
            proxy_status_entry(asset.id, "ready", 100, path, reason, "")
        }
        Err(message) if message == "the project changed" => return false,
        Err(message) => proxy_status_entry(asset.id, "failed", 0, "", reason, message),
    };
    set_proxy_status(app, proxies, project_path, status)
}
