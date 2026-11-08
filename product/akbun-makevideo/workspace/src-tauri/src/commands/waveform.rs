use super::*;

pub(crate) fn set_waveform_status(
    app: &AppHandle,
    waveforms: &Arc<Mutex<WaveformState>>,
    project_path: &str,
    status: WaveformStatus,
) -> bool {
    let mut current = waveforms.lock().unwrap();
    if current.project_path != project_path {
        return false;
    }
    current
        .entries
        .insert(status.asset_id.clone(), status.clone());
    drop(current);
    emit_waveform_status(app, status);
    true
}

pub(crate) fn decode_waveform(ffmpeg_path: &str, asset: &Asset) -> Result<Vec<[f32; 2]>, String> {
    let mut child = Command::new(ffmpeg_path)
        .args(makevideo_waveform::ffmpeg_args(asset))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("cannot start ffmpeg: {error}"))?;
    let mut output = child.stdout.take().ok_or("ffmpeg did not provide audio")?;
    let mut buffer = [0_u8; 16_384];
    let mut pending = None;
    let mut peaks = makevideo_waveform::PeakBuilder::new();
    loop {
        let read = output
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        let mut at = 0;
        if let Some(low) = pending.take() {
            peaks.push(i16::from_le_bytes([low, buffer[0]]));
            at = 1;
        }
        while at + 1 < read {
            peaks.push(i16::from_le_bytes([buffer[at], buffer[at + 1]]));
            at += 2;
        }
        if at < read {
            pending = Some(buffer[at]);
        }
    }
    let status = child.wait().map_err(|error| error.to_string())?;
    if !status.success() {
        return Err("ffmpeg could not decode the waveform".into());
    }
    Ok(peaks.finish())
}

#[tauri::command]
pub fn waveform_status(state: State<AppState>) -> Vec<WaveformStatus> {
    waveform_statuses(&state.waveforms.lock().unwrap())
}

#[tauri::command]
pub fn start_waveforms(
    app: AppHandle,
    state: State<AppState>,
    project_path: String,
) -> Result<Vec<WaveformStatus>, String> {
    start_waveforms_inner(app, &state, project_path)
}

pub(crate) fn start_waveforms_inner(
    app: AppHandle,
    state: &AppState,
    project_path: String,
) -> Result<Vec<WaveformStatus>, String> {
    let configured = state.settings.lock().unwrap().ffmpeg_dir.clone();
    let ffmpeg_path = find_tool(&app, "ffmpeg", &configured)
        .ok_or("ffmpeg was not found, so waveforms cannot be created")?;
    let project = state.document.lock().unwrap().project().clone();
    let mut jobs = Vec::new();
    {
        let mut waveforms = state.waveforms.lock().unwrap();
        if waveforms.project_path != project_path {
            waveforms.project_path = project_path.clone();
            waveforms.entries.clear();
        }
        let wanted: HashSet<String> = project
            .assets
            .iter()
            .filter(|asset| makevideo_waveform::needs_waveform(asset))
            .map(|asset| asset.id.clone())
            .collect();
        waveforms.entries.retain(|id, _| wanted.contains(id));
        for asset in project
            .assets
            .iter()
            .filter(|asset| wanted.contains(&asset.id))
        {
            // Every save comes through here. A peaks file already read for this
            // project is not parsed again; opening a project clears the map.
            if waveforms
                .entries
                .get(&asset.id)
                .is_some_and(|status| status.state == "ready")
            {
                continue;
            }
            if let Some(waveform) = makevideo_waveform::read_valid(&project_path, asset) {
                waveforms.entries.insert(
                    asset.id.clone(),
                    WaveformStatus {
                        asset_id: asset.id.clone(),
                        state: "ready".into(),
                        buckets_per_second: waveform.buckets_per_second,
                        peaks: waveform.peaks,
                        message: String::new(),
                    },
                );
            } else if !matches!(
                waveforms
                    .entries
                    .get(&asset.id)
                    .map(|status| status.state.as_str()),
                Some("queued" | "generating")
            ) {
                waveforms.entries.insert(
                    asset.id.clone(),
                    WaveformStatus {
                        asset_id: asset.id.clone(),
                        state: "queued".into(),
                        buckets_per_second: makevideo_waveform::BUCKETS_PER_SECOND as u32,
                        peaks: Vec::new(),
                        message: String::new(),
                    },
                );
                jobs.push(asset.clone());
            }
        }
    }
    if !jobs.is_empty() {
        let waveforms = Arc::clone(&state.waveforms);
        let worker = std::thread::spawn(move || {
            let dir = match makevideo_waveform::waveform_dir(&project_path) {
                Ok(dir) => dir,
                Err(message) => {
                    for asset in jobs {
                        set_waveform_status(
                            &app,
                            &waveforms,
                            &project_path,
                            WaveformStatus {
                                asset_id: asset.id,
                                state: "failed".into(),
                                buckets_per_second: 0,
                                peaks: Vec::new(),
                                message: message.clone(),
                            },
                        );
                    }
                    return;
                }
            };
            if let Err(error) = std::fs::create_dir_all(dir) {
                for asset in jobs {
                    set_waveform_status(
                        &app,
                        &waveforms,
                        &project_path,
                        WaveformStatus {
                            asset_id: asset.id,
                            state: "failed".into(),
                            buckets_per_second: 0,
                            peaks: Vec::new(),
                            message: error.to_string(),
                        },
                    );
                }
                return;
            }
            for asset in jobs {
                if !set_waveform_status(
                    &app,
                    &waveforms,
                    &project_path,
                    WaveformStatus {
                        asset_id: asset.id.clone(),
                        state: "generating".into(),
                        buckets_per_second: makevideo_waveform::BUCKETS_PER_SECOND as u32,
                        peaks: Vec::new(),
                        message: String::new(),
                    },
                ) {
                    return;
                }
                let result = decode_waveform(&ffmpeg_path, &asset)
                    .and_then(|peaks| makevideo_waveform::write(&project_path, &asset, peaks));
                match result {
                    Ok(waveform) => {
                        set_waveform_status(
                            &app,
                            &waveforms,
                            &project_path,
                            WaveformStatus {
                                asset_id: asset.id,
                                state: "ready".into(),
                                buckets_per_second: waveform.buckets_per_second,
                                peaks: waveform.peaks,
                                message: String::new(),
                            },
                        );
                    }
                    Err(message) => {
                        set_waveform_status(
                            &app,
                            &waveforms,
                            &project_path,
                            WaveformStatus {
                                asset_id: asset.id,
                                state: "failed".into(),
                                buckets_per_second: 0,
                                peaks: Vec::new(),
                                message,
                            },
                        );
                    }
                }
            }
        });
        let mut workers = state.waveform_workers.lock().unwrap();
        workers.retain(|worker| !worker.is_finished());
        workers.push(worker);
    }
    Ok(waveform_statuses(&state.waveforms.lock().unwrap()))
}
