//! The playback thread

use super::*;

pub(super) fn sync_audio_active(pipeline: &Pipeline, audio_blockers: &AtomicU64) {
    let ready = pipeline.transport.is_playing() && pipeline.transport.audio_ready();
    if !ready || audio_blockers.load(Ordering::SeqCst) != 0 {
        pipeline.active.store(false, Ordering::SeqCst);
        return;
    }
    pipeline.active.store(true, Ordering::SeqCst);
    // A caller can close the gate between the check and the store above.
    // Recheck after opening so every interleaving ends closed when a command
    // is pending.
    if audio_blockers.load(Ordering::SeqCst) != 0 {
        pipeline.active.store(false, Ordering::SeqCst);
    }
}

pub(super) fn run(mut state: Loop) {
    let frame = state.frame;
    let mut current = pipeline(&mut state, frame);
    let mut pending: Option<PendingReconfigure> = None;
    let mut latest_generation = 0;
    loop {
        match state.commands.try_recv() {
            Ok(Command::Stop) | Err(TryRecvError::Disconnected) => {
                if let Some(candidate) = pending.take() {
                    let _ = candidate.reply.send(Err(
                        "the playback session stopped during reconfiguration".into(),
                    ));
                }
                break;
            }
            Ok(Command::Play(reply)) => {
                current.transport.play();
                state.shared.playing.store(true, Ordering::Relaxed);
                state
                    .shared
                    .position
                    .store(current.transport.position(), Ordering::Relaxed);
                sync_audio_active(&current, &state.audio_blockers);
                let _ = reply.send(());
                continue;
            }
            Ok(Command::Pause(reply)) => {
                current.active.store(false, Ordering::SeqCst);
                current.transport.pause();
                state.shared.playing.store(false, Ordering::Relaxed);
                state
                    .shared
                    .position
                    .store(current.transport.position(), Ordering::Relaxed);
                state.audio_blockers.fetch_sub(1, Ordering::SeqCst);
                let _ = reply.send(());
                continue;
            }
            Ok(Command::Seek(frame, reply)) => {
                // Close the callback gate before the asynchronous decoder sees
                // the seek. Until its flush arrives the ring still contains
                // samples from the position being left.
                current.active.store(false, Ordering::SeqCst);
                current.transport.seek(frame);
                state
                    .shared
                    .position
                    .store(current.transport.position(), Ordering::Relaxed);
                state.audio_blockers.fetch_sub(1, Ordering::SeqCst);
                let _ = reply.send(());
                continue;
            }
            Ok(Command::Resize(width, height)) => {
                state.sink.resize(width, height);
                continue;
            }
            Ok(Command::Show) => {
                state.visibility = MonitorVisibility::Visible;
                current.transport.redraw_video();
                continue;
            }
            Ok(Command::Hide) => {
                state.visibility = MonitorVisibility::Hidden;
                continue;
            }
            Ok(Command::Redraw) => {
                if !current.transport.is_playing() {
                    cancel_pending(
                        &mut current.transport,
                        &mut pending,
                        &state.shared,
                        "the timeline changed while the replacement was preparing",
                    );
                    let at = current.transport.position();
                    current.active.store(false, Ordering::SeqCst);
                    state.project = makevideo_proxy::playback_project(
                        state.document.lock().unwrap().project(),
                        &state.config.proxy_paths,
                    );
                    current = pipeline(&mut state, at);
                }
                continue;
            }
            Ok(Command::Reconfigure {
                generation,
                settings_generation,
                mut config,
                reply,
            }) => {
                if state
                    .shared
                    .settings_order
                    .lock_if_current(settings_generation)
                    .is_none()
                {
                    let _ = reply.send(Err(SETTINGS_SUPERSEDED.into()));
                    state
                        .shared
                        .reconfiguring
                        .store(pending.is_some(), Ordering::Relaxed);
                    continue;
                }
                if !accept_generation(&mut latest_generation, generation) {
                    let _ = reply.send(Err(SETTINGS_SUPERSEDED.into()));
                    state
                        .shared
                        .reconfiguring
                        .store(pending.is_some(), Ordering::Relaxed);
                    continue;
                }
                let reason = if pending
                    .as_ref()
                    .is_some_and(|candidate| candidate.owner == ReplacementOwner::ProxyRefresh)
                {
                    EXPLICIT_RECONFIGURE_PENDING
                } else {
                    SETTINGS_SUPERSEDED
                };
                cancel_pending(&mut current.transport, &mut pending, &state.shared, reason);
                merge_active_proxy_paths(&mut config, &state.config);
                let project = prepare_candidate(&mut current.transport, &state.document, &config);
                pending = Some(PendingReconfigure {
                    generation,
                    owner: ReplacementOwner::Settings(settings_generation),
                    config,
                    project,
                    reply,
                    deadline: Instant::now() + RECONFIGURE_TIMEOUT,
                });
                state.shared.reconfiguring.store(true, Ordering::Relaxed);
                continue;
            }
            Ok(Command::RefreshProxies {
                generation,
                proxy_paths,
                reply,
            }) => {
                if !proxy_refresh_allowed(pending.as_ref().map(|candidate| candidate.owner)) {
                    let _ = reply.send(Err(EXPLICIT_RECONFIGURE_PENDING.into()));
                    continue;
                }
                if !accept_generation(&mut latest_generation, generation) {
                    let _ = reply.send(Err(EXPLICIT_RECONFIGURE_PENDING.into()));
                    continue;
                }
                cancel_pending_with_result(
                    &mut current.transport,
                    &mut pending,
                    &state.shared,
                    Ok(()),
                );
                let config = refreshed_proxy_config(&state.config, proxy_paths);
                if config.proxy_paths == state.config.proxy_paths {
                    state.shared.reconfiguring.store(false, Ordering::Relaxed);
                    let _ = reply.send(Ok(()));
                    continue;
                }
                let project = prepare_candidate(&mut current.transport, &state.document, &config);
                pending = Some(PendingReconfigure {
                    generation,
                    owner: ReplacementOwner::ProxyRefresh,
                    config,
                    project,
                    reply,
                    deadline: Instant::now() + RECONFIGURE_TIMEOUT,
                });
                state.shared.reconfiguring.store(true, Ordering::Relaxed);
                continue;
            }
            Ok(Command::CancelReconfigure(generation)) => {
                if pending
                    .as_ref()
                    .is_some_and(|candidate| candidate.generation == generation)
                {
                    cancel_pending(
                        &mut current.transport,
                        &mut pending,
                        &state.shared,
                        "the replacement playback request timed out",
                    );
                }
                continue;
            }
            Ok(Command::SetGuides {
                generation,
                settings_generation,
                guides,
                reply,
            }) => {
                let Some(mut settings_guard) = state
                    .shared
                    .settings_order
                    .lock_if_current(settings_generation)
                else {
                    let _ = reply.send(Err(SETTINGS_SUPERSEDED.into()));
                    state
                        .shared
                        .reconfiguring
                        .store(pending.is_some(), Ordering::Relaxed);
                    continue;
                };
                if !accept_generation(&mut latest_generation, generation) {
                    let _ = reply.send(Err(SETTINGS_SUPERSEDED.into()));
                    continue;
                }
                let reason = if pending
                    .as_ref()
                    .is_some_and(|candidate| candidate.owner == ReplacementOwner::ProxyRefresh)
                {
                    EXPLICIT_RECONFIGURE_PENDING
                } else {
                    SETTINGS_SUPERSEDED
                };
                cancel_pending(&mut current.transport, &mut pending, &state.shared, reason);
                state.config.guides = guides;
                state.sink.set_guides(guides);
                current.transport.redraw_video();
                state.shared.set_live_config(&state.config);
                settings_guard.committed = settings_generation;
                let _ = reply.send(Ok(()));
                continue;
            }
            Err(TryRecvError::Empty) => {}
        }

        if pending.as_ref().is_some_and(|candidate| {
            candidate
                .owner
                .settings_generation()
                .is_some_and(|generation| {
                    state
                        .shared
                        .settings_order
                        .lock_if_current(generation)
                        .is_none()
                })
        }) {
            cancel_pending(
                &mut current.transport,
                &mut pending,
                &state.shared,
                SETTINGS_SUPERSEDED,
            );
            continue;
        }

        let tick = {
            let mut sink = monitor_sink(
                &state.config,
                &state.presenter,
                &mut state.sink,
                state.visibility,
            );
            current.transport.tick(&mut sink)
        };
        state
            .shared
            .position
            .store(current.transport.position(), Ordering::Relaxed);

        if tick != Tick::Ended {
            sync_audio_active(&current, &state.audio_blockers);
        }

        match tick {
            Tick::Presented {
                present_ms,
                late_ms,
                ..
            } => {
                state.counters.presented.fetch_add(1, Ordering::Relaxed);
                state.counters.record_present(present_ms, late_ms);
            }
            Tick::Skipped { .. } => {
                state.counters.skipped.fetch_add(1, Ordering::Relaxed);
            }
            Tick::Held { wait } => {
                if !wait.is_zero() {
                    std::thread::sleep(wait);
                }
            }
            Tick::Starved => {
                state.counters.starved.fetch_add(1, Ordering::Relaxed);
                std::thread::sleep(Duration::from_millis(1));
            }
            Tick::Idle => std::thread::sleep(REST),
            Tick::Ended => {
                // The timeline is over. Stop where it ended and leave the last
                // frame up, which is what the transport does anyway; going back
                // to the top would lose the place somebody was working at.
                if current.transport.is_playing() {
                    current.active.store(false, Ordering::SeqCst);
                    current.transport.pause();
                    state.shared.playing.store(false, Ordering::Relaxed);
                }
            }
            Tick::Failed { reason } => {
                state.counters.failed_frames.fetch_add(1, Ordering::Relaxed);
                // Recorded once and then carried on with. A frame that could
                // not be drawn is a frame missing from the screen, and stopping
                // the sound as well would make a bad monitor into a broken app.
                let mut slot = state.shared.failed.lock().unwrap();
                if slot.is_none() {
                    *slot = Some(reason);
                }
                std::thread::sleep(REST);
            }
            Tick::Resynced { .. } => {
                state.counters.resynced.fetch_add(1, Ordering::Relaxed);
            }
        }

        if pending
            .as_ref()
            .is_some_and(|candidate| Instant::now() >= candidate.deadline)
        {
            cancel_pending(
                &mut current.transport,
                &mut pending,
                &state.shared,
                "the replacement playback path did not present a frame in time",
            );
            continue;
        }

        let settings_generation = pending
            .as_ref()
            .and_then(|candidate| candidate.owner.settings_generation());
        let mut settings_guard = match settings_generation {
            Some(generation) => match state.shared.settings_order.lock_if_current(generation) {
                Some(guard) => Some(guard),
                None => {
                    cancel_pending(
                        &mut current.transport,
                        &mut pending,
                        &state.shared,
                        SETTINGS_SUPERSEDED,
                    );
                    continue;
                }
            },
            None => None,
        };
        let replacement = pending.as_ref().map(|candidate| {
            let mut sink = monitor_sink(
                &candidate.config,
                &state.presenter,
                &mut state.sink,
                state.visibility,
            );
            current.transport.tick_video_replacement(&mut sink)
        });
        match replacement {
            Some(VideoReplacement::Committed(tick)) => {
                let candidate = pending.take().expect("a replacement just committed");
                state.config = candidate.config;
                state.project = candidate.project;
                state.shared.set_live_config(&state.config);
                if candidate.owner == ReplacementOwner::ProxyRefresh {
                    state.shared.set_confirmed_proxy_paths(&state.config);
                }
                state
                    .shared
                    .generation
                    .store(candidate.generation, Ordering::Relaxed);
                if let (Some(generation), Some(guard)) = (
                    candidate.owner.settings_generation(),
                    settings_guard.as_mut(),
                ) {
                    guard.committed = generation;
                }
                state.shared.reconfiguring.store(false, Ordering::Relaxed);
                if let Tick::Presented {
                    present_ms,
                    late_ms,
                    ..
                } = tick
                {
                    state.counters.presented.fetch_add(1, Ordering::Relaxed);
                    state.counters.record_present(present_ms, late_ms);
                } else if tick == Tick::Ended && current.transport.is_playing() {
                    current.active.store(false, Ordering::SeqCst);
                    current.transport.pause();
                    state.shared.playing.store(false, Ordering::Relaxed);
                }
                let _ = candidate.reply.send(Ok(()));
            }
            Some(VideoReplacement::Failed(reason)) => {
                let candidate = pending.take().expect("a replacement just failed");
                state
                    .sink
                    .set_frame_size(state.config.width, state.config.height);
                state.sink.set_guides(state.config.guides);
                state.shared.reconfiguring.store(false, Ordering::Relaxed);
                let _ = candidate.reply.send(Err(reason));
            }
            Some(VideoReplacement::Pending) | None => {}
        }
        drop(settings_guard);
    }
    state.shared.reconfiguring.store(false, Ordering::Relaxed);
}

pub(super) fn cancel_pending(
    transport: &mut Transport,
    pending: &mut Option<PendingReconfigure>,
    shared: &Shared,
    reason: &str,
) {
    cancel_pending_with_result(transport, pending, shared, Err(reason.to_string()));
}

pub(super) fn cancel_pending_with_result(
    transport: &mut Transport,
    pending: &mut Option<PendingReconfigure>,
    shared: &Shared,
    result: Result<(), String>,
) {
    transport.cancel_video_replacement();
    if let Some(candidate) = pending.take() {
        let _ = candidate.reply.send(result);
    }
    shared.reconfiguring.store(false, Ordering::Relaxed);
}

pub(super) fn prepare_candidate(
    transport: &mut Transport,
    document: &Arc<Mutex<makevideo_edit::Document>>,
    config: &Config,
) -> Project {
    let project =
        makevideo_proxy::playback_project(document.lock().unwrap().project(), &config.proxy_paths);
    transport.prepare_video(VideoSetup {
        project: &project,
        width: config.width,
        height: config.height,
        frame_buffering: config.frame_buffering,
        frame_readers: Arc::new(FrameReaders::new(&config.ffmpeg, config.hwaccel.as_deref())),
        resync_after: config.resync_after,
    });
    project
}

pub(super) fn accept_generation(latest: &mut u64, generation: u64) -> bool {
    if generation <= *latest {
        return false;
    }
    *latest = generation;
    true
}

pub(super) fn proxy_refresh_allowed(pending: Option<ReplacementOwner>) -> bool {
    !matches!(pending, Some(ReplacementOwner::Settings(_)))
}

pub(super) fn refreshed_proxy_config(
    active: &Config,
    proxy_paths: HashMap<String, String>,
) -> Config {
    let mut config = active.clone();
    config.proxy_paths = if config.proxy_enabled {
        proxy_paths
    } else {
        HashMap::new()
    };
    config
}

pub(super) fn merge_active_proxy_paths(candidate: &mut Config, active: &Config) {
    if !candidate.proxy_enabled {
        candidate.proxy_paths.clear();
        return;
    }
    candidate.proxy_paths.extend(active.proxy_paths.clone());
}

pub(super) fn pipeline(state: &mut Loop, frame: i64) -> Pipeline {
    let (mut transport, consumer) = Transport::start(Setup {
        project: &state.project,
        width: state.config.width,
        height: state.config.height,
        frame_buffering: state.config.frame_buffering,
        frame_readers: Arc::new(FrameReaders::new(
            &state.config.ffmpeg,
            state.config.hwaccel.as_deref(),
        )),
        audio_buffering: state.config.audio_buffering,
        audio_readers: Arc::new(AudioReaders::new(&state.config.ffmpeg)),
        audio: AudioOptions::default(),
        resync_after: state.config.resync_after,
    });
    let clock = Arc::clone(transport.audio().clock());
    // Seek before the device opens, so the first samples anybody hears are the
    // ones at the playhead rather than the top of the timeline.
    if frame > 0 {
        transport.seek(frame);
    }
    let active = Arc::clone(&state.active);
    let device = DeviceSink::open(consumer, clock, Arc::clone(&active));
    Pipeline {
        transport,
        _device: device,
        active,
    }
}
