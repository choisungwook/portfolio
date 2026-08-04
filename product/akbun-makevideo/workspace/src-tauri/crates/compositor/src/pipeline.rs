//! The composited render: one decoder per clip, the wgpu compositor, one
//! encoder.
//!
//! The picture takes the long way round here — decoded to raw RGBA, drawn by
//! the compositor, handed back to ffmpeg on a pipe — so that the frame the
//! preview shows and the frame that lands in the file come out of the same
//! shader. Audio never leaves ffmpeg; amix is not worth reimplementing.
//!
//! The cost is real: 1080p30 is about 250 MB a second through the pipes, and it
//! is why the filter graph is still there as the fast path. See
//! wiki/architecture/compositor.md.

use crate::{Compositor, Placement as Draw, Source};
use makevideo_render::accel::Acceleration;
use makevideo_render::{ffmpeg, layout, AssetKind, Project, RationalTime};
use std::io::{Read, Write};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// One clip being decoded, started when its first frame is wanted and killed
/// as soon as its last one has been read. Starting them all at once would mean
/// a process per clip for the whole render.
struct Decoder {
    placement: layout::Placement,
    end_frame: i64,
    frame_bytes: usize,
    child: Option<Child>,
    stdout: Option<ChildStdout>,
    buffer: Vec<u8>,
    /// The buffer holds a frame for the current index.
    filled: bool,
    /// The source ran out or never started. Its clip simply stops drawing,
    /// which is the same thing a missing file does in the timeline.
    dead: bool,
}

impl Decoder {
    fn wants(&self, frame: i64) -> bool {
        self.placement.covers(frame) && frame < self.end_frame
    }
}

pub struct Options<'a> {
    pub ffmpeg: &'a str,
    pub project: &'a Project,
    pub output: &'a str,
    pub preset: ffmpeg::Preset,
    pub accel: Option<&'a Acceleration>,
}

/// Runs the whole render. Blocks, so it is called from the render thread.
///
/// `encoder_slot` is where the running ffmpeg is parked so Cancel can kill it,
/// and `cancelled` is checked once a frame.
pub fn run<F>(
    compositor: &Compositor,
    options: Options<'_>,
    encoder_slot: &Arc<Mutex<Option<Child>>>,
    cancelled: &Arc<AtomicBool>,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64),
{
    let project = options.project;
    let rate = project.rate();
    // The progress bar is the only thing here that still speaks milliseconds,
    // because that is what a progress bar is for.
    let total_ms = project.duration().to_millis().max(0) as u64;
    let (width, height) = ffmpeg::output_size(&project.settings, options.preset);
    let frames = layout::frame_count(project);
    if frames == 0 {
        return Err("the timeline is empty, there is nothing to render".into());
    }

    let encoder_args =
        ffmpeg::encoder_args(project, options.output, options.preset, options.accel)?;
    let mut encoder = Command::new(options.ffmpeg)
        .args(&encoder_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("cannot start the encoder: {error}"))?;
    let mut stdin = encoder
        .stdin
        .take()
        .ok_or("the encoder took no input pipe")?;
    let mut stderr = encoder.stderr.take();
    *encoder_slot.lock().unwrap() = Some(encoder);

    // Drained on its own thread: a chatty failure would otherwise fill the pipe
    // and stop ffmpeg on a write that never completes.
    let errors = Arc::new(Mutex::new(String::new()));
    let drain = stderr.take().map(|mut stderr| {
        let errors = Arc::clone(&errors);
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.read_to_string(&mut text);
            *errors.lock().unwrap() = text;
        })
    });

    let mut decoders: Vec<Decoder> = layout::placements(project, width, height)
        .into_iter()
        .map(|placement| {
            // Both of these used to be a millisecond position multiplied by a
            // frame rate and rounded, which is how a decoder could be started
            // one frame late and every clip after it read from the wrong place.
            // A placement is already counted in frames.
            let end_frame = placement.end_frame().min(frames);
            Decoder {
                frame_bytes: (placement.dst.w as usize) * (placement.dst.h as usize) * 4,
                buffer: Vec::new(),
                end_frame,
                placement,
                child: None,
                stdout: None,
                filled: false,
                dead: false,
            }
        })
        .collect();

    let mut failure = None;
    for frame in 0..frames {
        if cancelled.load(Ordering::SeqCst) {
            break;
        }

        // Start, feed and retire the decoders. Split from drawing below because
        // reading needs them mutable and drawing borrows their buffers.
        for decoder in decoders.iter_mut() {
            if !decoder.wants(frame) {
                if decoder.child.is_some() && frame >= decoder.end_frame {
                    if let Some(mut child) = decoder.child.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    decoder.stdout = None;
                    decoder.buffer = Vec::new();
                }
                decoder.filled = false;
                continue;
            }
            if decoder.dead {
                decoder.filled = false;
                continue;
            }
            if decoder.child.is_none() {
                let args = ffmpeg::decoder_args(&ffmpeg::Decode {
                    path: &decoder.placement.path,
                    kind: decoder.placement.kind,
                    in_time: decoder.placement.in_time(rate),
                    duration: decoder.placement.duration(rate),
                    width: decoder.placement.dst.w,
                    height: decoder.placement.dst.h,
                    rate,
                    // A still has nothing to decode, so no hint for it.
                    hwaccel: if decoder.placement.kind == AssetKind::Video {
                        options.accel.and_then(|a| a.hwaccel.as_deref())
                    } else {
                        None
                    },
                });
                match Command::new(options.ffmpeg)
                    .args(&args)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    // A decoder that cannot open its file just stops drawing,
                    // the same as a clip whose media was moved.
                    .stderr(Stdio::null())
                    .spawn()
                {
                    Ok(mut child) => {
                        decoder.stdout = child.stdout.take();
                        decoder.child = Some(child);
                        decoder.buffer = vec![0u8; decoder.frame_bytes];
                    }
                    Err(_) => {
                        decoder.dead = true;
                        decoder.filled = false;
                        continue;
                    }
                }
            }
            let filled = match decoder.stdout.as_mut() {
                Some(stdout) => stdout.read_exact(&mut decoder.buffer).is_ok(),
                None => false,
            };
            if !filled {
                decoder.dead = true;
            }
            decoder.filled = filled;
        }

        let layers: Vec<(Source<'_>, Draw)> = decoders
            .iter()
            .filter(|decoder| decoder.filled)
            .map(|decoder| {
                (
                    Source {
                        rgba: &decoder.buffer,
                        width: decoder.placement.dst.w,
                        height: decoder.placement.dst.h,
                    },
                    Draw {
                        dst: decoder.placement.dst,
                        opacity: decoder.placement.opacity,
                    },
                )
            })
            .collect();

        let picture = match compositor.compose(width, height, &layers) {
            Ok(picture) => picture,
            Err(error) => {
                failure = Some(error);
                break;
            }
        };
        if let Err(error) = stdin.write_all(&picture) {
            // A broken pipe means ffmpeg is already gone; its own message is
            // the useful one, so this only stops the loop.
            failure = Some(format!("the encoder stopped taking frames: {error}"));
            break;
        }
        if frame % 10 == 0 || frame + 1 == frames {
            let position = layout::frame_time(frame, rate).to_millis().max(0) as u64;
            on_progress(position.min(total_ms), total_ms);
        }
    }

    // Closing stdin is what tells ffmpeg the video stream is over.
    drop(stdin);
    for decoder in decoders.iter_mut() {
        if let Some(mut child) = decoder.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    let status = encoder_slot
        .lock()
        .unwrap()
        .take()
        .and_then(|mut child| child.wait().ok());
    if let Some(handle) = drain {
        let _ = handle.join();
    }
    if cancelled.load(Ordering::SeqCst) {
        return Err("Render cancelled.".into());
    }
    if let Some(error) = failure {
        return Err(error);
    }
    match status {
        Some(status) if status.success() => {
            on_progress(total_ms, total_ms);
            Ok(())
        }
        _ => {
            let text = errors.lock().unwrap().clone();
            Err(if text.trim().is_empty() {
                "the encoder stopped without writing the file.".into()
            } else {
                text.trim().to_string()
            })
        }
    }
}

/// One frame, for the preview. Same compositor, same shader, same geometry as
/// the render — that is the entire point of it existing.
///
/// Each visible clip is decoded with its own one frame ffmpeg call, so this
/// costs roughly 50 ms a layer. Fast enough to answer when the playhead stops,
/// nowhere near fast enough to play with, which is why the page only asks for
/// it when it is not playing.
pub fn preview_frame(
    compositor: &Compositor,
    ffmpeg_path: &str,
    project: &Project,
    frame: i64,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    let rate = project.rate();
    let layers = layout::layers_at(project, frame, width, height);

    let mut frames = Vec::new();
    for layer in &layers {
        let args = ffmpeg::decoder_args(&ffmpeg::Decode {
            path: &layer.path,
            kind: layer.kind,
            in_time: layer.source_time(rate),
            // Two frames' worth, because a source that starts a fraction late
            // can hand back nothing at all for one. Only the first is read.
            duration: RationalTime::new(2, rate),
            width: layer.dst.w,
            height: layer.dst.h,
            rate,
            hwaccel: None,
        });
        let output = Command::new(ffmpeg_path)
            .args(&args)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let wanted = (layer.dst.w as usize) * (layer.dst.h as usize) * 4;
        match output {
            Ok(output) if output.stdout.len() >= wanted => {
                let mut pixels = output.stdout;
                pixels.truncate(wanted);
                frames.push(Some(pixels));
            }
            // A clip whose media has moved draws nothing, exactly as in the
            // render, rather than failing the whole preview.
            _ => frames.push(None),
        }
    }

    let sources: Vec<(Source<'_>, Draw)> = layers
        .iter()
        .zip(frames.iter())
        .filter_map(|(layer, pixels)| {
            pixels.as_ref().map(|pixels| {
                (
                    Source {
                        rgba: pixels,
                        width: layer.dst.w,
                        height: layer.dst.h,
                    },
                    Draw {
                        dst: layer.dst,
                        opacity: layer.opacity,
                    },
                )
            })
        })
        .collect();

    compositor.compose(width, height, &sources)
}
