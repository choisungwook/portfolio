//! The composited render: the frame source, the wgpu compositor, one encoder.
//!
//! The picture takes the long way round here — decoded to raw RGBA, drawn by
//! the compositor, handed back to ffmpeg on a pipe — so that the frame the
//! preview shows and the frame that lands in the file come out of the same
//! shader. Audio never leaves ffmpeg; amix is not worth reimplementing.
//!
//! The cost is real: 1080p30 is about 250 MB a second through the pipes, and it
//! is why the filter graph is still there as the fast path. See
//! wiki/architecture/compositor.md.
//!
//! The decoding is not here. It is `source::FrameSource`, the same buffered
//! source playback uses, so the frames the render encodes and the frames
//! playback shows are read by one piece of code. The render only differs in
//! what it does when one is not ready: it waits, because a file has no
//! deadline.

use crate::source::{Buffering, FfmpegReaders, FrameSource, Supply};
use crate::{Compositor, Placement as Draw, Source};
use makevideo_render::accel::Acceleration;
use makevideo_render::{ffmpeg, layout, Project, RationalTime};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Shallower and later than playback asks for. A render has no deadline to
/// miss, so the buffers are here to keep the decoders busy while a frame is
/// composited and encoded, not to absorb jitter. Depth is what it costs: at 4K
/// a frame is 33 MB, and this is per clip on screen.
const RENDER_BUFFERING: Buffering = Buffering { depth: 3, lead: 8 };

/// How long the frame loop waits before looking at the cancel flag again. A
/// render frame is worth waiting for; a cancelled one is not worth waiting a
/// whole frame for.
const CANCEL_POLL: Duration = Duration::from_millis(50);

/// How many preview decoders may run at the same time.
///
/// A bound rather than "all of them". Each one is a whole ffmpeg process that
/// spawns threads of its own, so a timeline with a dozen layers under the
/// playhead would put more processes on the machine than it has cores and every
/// one of them would finish later — including the ones playback is waiting on.
/// Four covers the layer counts a stage actually holds.
const DECODE_AT_ONCE: usize = 4;

/// Run `work` over `items` `limit` at a time, answers in the order asked.
///
/// Order is the whole reason this is a function. The layers are drawn back to
/// front and the pixels are zipped against them by position, so a result that
/// arrives out of order does not fail — it silently paints the wrong layer.
fn in_batches<T, R, F>(items: &[T], limit: usize, work: F) -> Vec<R>
where
    T: Sync,
    R: Send,
    F: Fn(&T) -> R + Sync,
{
    let mut answers = Vec::with_capacity(items.len());
    for batch in items.chunks(limit.max(1)) {
        std::thread::scope(|scope| {
            let running: Vec<_> = batch
                .iter()
                .map(|item| scope.spawn(|| work(item)))
                .collect();
            for handle in running {
                // A decoder thread only runs `work`, which returns its failures
                // rather than panicking, so this join is not where a bad file
                // shows up.
                if let Ok(answer) = handle.join() {
                    answers.push(answer);
                }
            }
        });
    }
    answers
}

/// One layer's frame as raw RGBA, or `None` when it could not be decoded.
///
/// A clip whose media has moved draws nothing, exactly as in the render, rather
/// than failing the whole preview.
fn decode_layer(
    ffmpeg_path: &str,
    layer: &layout::Layer,
    rate: makevideo_render::Rate,
) -> Option<Vec<u8>> {
    let args = ffmpeg::decoder_args(&ffmpeg::Decode {
        path: &layer.path,
        kind: layer.kind,
        in_time: layer.source_time(rate),
        // Two frames' worth, because a source that starts a fraction late can
        // hand back nothing at all for one. Only the first is read.
        duration: RationalTime::new(2, rate),
        width: layer.dst.w,
        height: layer.dst.h,
        rate,
        speed: 1.0,
        hwaccel: None,
        crop: layer.crop,
        head_pad_frames: 0,
    });
    let output = Command::new(ffmpeg_path)
        .args(&args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    let wanted = (layer.dst.w as usize) * (layer.dst.h as usize) * 4;
    if output.stdout.len() < wanted {
        return None;
    }
    let mut pixels = output.stdout;
    pixels.truncate(wanted);
    if let Some(style) = &layer.overlay_style {
        crate::source::apply_overlay_style(&mut pixels, layer.dst.w, layer.dst.h, style);
    }
    Some(pixels)
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
    crate::text::set_ffmpeg_path(options.ffmpeg);
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

    let mut source = FrameSource::new(
        project,
        width,
        height,
        RENDER_BUFFERING,
        Arc::new(FfmpegReaders::new(
            options.ffmpeg,
            options.accel.and_then(|a| a.hwaccel.as_deref()),
        )),
    );

    let mut failure = None;
    'render: loop {
        // Waiting in short spans rather than in one: a decoder is worth waiting
        // for, a cancelled render is not.
        let frame = loop {
            if cancelled.load(Ordering::SeqCst) {
                break 'render;
            }
            match source.take_by(Instant::now() + CANCEL_POLL) {
                Supply::Ready(frame) => break frame,
                Supply::End => break 'render,
                Supply::Starved => continue,
            }
        };

        // Text and shape items are already in the frame — FrameSource puts
        // them there, so playback and this export composite the same picture.
        let layers: Vec<(Source<'_>, Draw)> = frame.sources();
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
        if frame.frame % 10 == 0 || frame.frame + 1 == frames {
            let position = layout::frame_time(frame.frame, rate).to_millis().max(0) as u64;
            on_progress(position.min(total_ms), total_ms);
        }
    }

    // Closing stdin is what tells ffmpeg the video stream is over, and dropping
    // the source is what stops the decoders still filling their queues.
    drop(source);
    drop(stdin);

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
/// Each visible clip is decoded with its own one frame ffmpeg call, which costs
/// roughly 50 ms. They run [`DECODE_AT_ONCE`] at a time rather than one after
/// another, so a stack of layers costs about what the deepest batch costs
/// instead of the sum. Still nowhere near fast enough to play with, which is
/// why the page only asks for it when it is not playing.
pub fn preview_frame(
    compositor: &Compositor,
    ffmpeg_path: &str,
    project: &Project,
    frame: i64,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    crate::text::set_ffmpeg_path(ffmpeg_path);
    let rate = project.rate();
    let layers = layout::layers_at(project, frame, width, height);

    let frames = in_batches(&layers, DECODE_AT_ONCE, |layer| {
        decode_layer(ffmpeg_path, layer, rate)
    });

    let mut luts = HashMap::new();
    for layer in &layers {
        let Some(path) = project
            .clip(&layer.clip_id)
            .and_then(|clip| clip.lut_path.as_deref())
        else {
            continue;
        };
        luts.entry(path)
            .or_insert_with(|| crate::lut::Lut::from_cube_file(path).ok());
    }
    let mut sources: Vec<(Source<'_>, Draw)> = layers
        .iter()
        .zip(frames.iter())
        .filter_map(|(layer, pixels)| {
            pixels.as_ref().map(|pixels| {
                (
                    Source {
                        rgba: pixels,
                        width: layer.dst.w,
                        height: layer.dst.h,
                        lut: project
                            .clip(&layer.clip_id)
                            .and_then(|clip| clip.lut_path.as_deref())
                            .and_then(|path| luts.get(path))
                            .and_then(Option::as_ref),
                    },
                    Draw {
                        dst: layer.dst,
                        opacity: layer.opacity,
                        blend_mode: layer.blend_mode,
                        adjustment: false,
                    },
                )
            })
        })
        .collect();

    let visual = crate::text::layers_at(project, frame, width, height);
    sources.extend(visual.iter().map(|layer| {
        (
            Source {
                rgba: &layer.pixels,
                width: layer.width,
                height: layer.height,
                lut: layer.lut.as_deref(),
            },
            layer.placement,
        )
    }));

    compositor.compose(width, height, &sources)
}

#[cfg(test)]
mod tests {
    use super::in_batches;

    #[test]
    fn batched_work_answers_in_the_order_it_was_asked() {
        // Deliberately uneven: the last batch is short, and the slowest item is
        // first so a racing implementation would hand its answer back last.
        let items: Vec<u64> = vec![30, 1, 1, 1, 1];
        let doubled = in_batches(&items, 2, |value| {
            std::thread::sleep(std::time::Duration::from_millis(*value));
            *value * 2
        });

        assert_eq!(doubled, vec![60, 2, 2, 2, 2]);
    }

    #[test]
    fn a_batch_limit_of_zero_still_runs_everything_once() {
        let items = vec!['a', 'b', 'c'];
        assert_eq!(in_batches(&items, 0, |value| *value), items);
    }
}
