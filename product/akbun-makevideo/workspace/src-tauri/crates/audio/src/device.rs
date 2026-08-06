//! A real output, and what to do when somebody pulls the headphones out.
//!
//! Everything else in this crate is arithmetic and can be tested against a
//! stopwatch. This is the part that talks to the operating system, so it is the
//! part kept behind a feature: `--no-default-features` builds a crate that has
//! never heard of cpal, which is the shape a build server wants and is also how
//! the mix is proved to stand on its own.
//!
//! # Unplugging is normal
//!
//! It is treated as a case from the first line rather than as an error, because
//! it is not rare — it is somebody taking their headphones off. An editor that
//! stops playing, or worse falls over, when that happens has interrupted the
//! work for a reason the person will not connect to what they did.
//!
//! So a thread owns the stream and nothing else does. When the stream reports a
//! device that has gone, or when the default output turns out to be a different
//! one than it was, it drops the stream and builds another on whatever the
//! default is now. The ring, the clock and the mix are untouched by all of it:
//! the position does not jump, the decoders do not restart, and what is heard
//! is a gap of a few hundred milliseconds where the swap happened.
//!
//! The stream has to be owned by one thread because cpal's `Stream` is not
//! `Send`. That constraint is what shapes this module: no `Mutex<Stream>` to
//! rebuild from elsewhere, one thread that owns it and takes instructions.
//!
//! # The rate the device wants
//!
//! 48 kHz is asked for first, because that is what the mix and the render are
//! both at and matching it means no resampling at all. A device that will not
//! do 48 kHz gets its own rate and the callback interpolates on the way out.
//!
//! That last resample is the only one that is not ffmpeg's, and it is
//! deliberately the last one: it converts a finished mix rather than a source,
//! so it cannot put two clips out of step with each other. The clock counts
//! engine frames taken from the ring, not device frames, which is also why a
//! device swap that changes the rate does not move the playhead.

use crate::realtime::{Clock, Consumer, CHANNELS, ENGINE_HZ};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, ErrorKind, SampleFormat, StreamConfig, SupportedStreamConfig};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

/// The most engine frames one callback can ask for. 8192 is 170 ms, which no
/// desktop output comes close to; the cap exists so the scratch buffer can be
/// allocated once, before the stream starts, and never grown inside the
/// callback.
const MAX_CALLBACK_FRAMES: usize = 8_192;

/// How often the owning thread looks at whether the output is still the one it
/// opened. Half a second is unnoticeable when unplugging and costs nothing.
const WATCH: Duration = Duration::from_millis(500);

/// How long to wait for a backend to hand over a stream before giving up. A
/// device that is wedged should not wedge the app with it.
const BUILD_TIMEOUT: Duration = Duration::from_secs(5);

/// What the output is doing, for a status line and for the soak.
#[derive(Debug, Default)]
pub struct Status {
    /// Times the stream has been rebuilt on a different or returning device.
    swaps: AtomicU64,
    /// The stream is not currently playing: nothing is open, or the last
    /// attempt failed. The engine keeps mixing either way, so this is the
    /// difference between silence and a stopped session.
    silent: AtomicBool,
    /// The last thing that went wrong, kept so a bug report has something in
    /// it. Written by the owning thread, read by anyone.
    last_error: Mutex<Option<String>>,
}

impl Status {
    pub fn swaps(&self) -> u64 {
        self.swaps.load(Ordering::Relaxed)
    }

    pub fn silent(&self) -> bool {
        self.silent.load(Ordering::Relaxed)
    }

    pub fn last_error(&self) -> Option<String> {
        self.last_error.lock().unwrap().clone()
    }

    fn failed(&self, message: String) {
        *self.last_error.lock().unwrap() = Some(message);
        self.silent.store(true, Ordering::Relaxed);
    }
}

/// A stream on the system's default output, rebuilt whenever that stops being
/// true.
pub struct DeviceSink {
    stop: Arc<AtomicBool>,
    status: Arc<Status>,
    owner: Option<JoinHandle<()>>,
}

impl DeviceSink {
    /// Open the default output and start playing whatever the ring holds.
    ///
    /// Returns as soon as the owning thread is running rather than when sound
    /// is coming out, because a device that takes two seconds to open should
    /// not hold up the rest of playback starting. [`Status::silent`] says
    /// whether it got there.
    pub fn open(consumer: Consumer, clock: Arc<Clock>) -> DeviceSink {
        let stop = Arc::new(AtomicBool::new(false));
        let status = Arc::new(Status::default());
        // One Arc, and only the current callback ever holds a clone of it. The
        // stream is dropped — which stops its callback — before the next one is
        // built, so there is never more than one consumer at a time and the
        // ring's single-reader promise holds.
        let consumer = Arc::new(consumer);

        let thread_stop = Arc::clone(&stop);
        let thread_status = Arc::clone(&status);
        let owner = std::thread::spawn(move || {
            let mut playing: Option<Playing> = None;
            while !thread_stop.load(Ordering::Relaxed) {
                let wanted = default_output_name();
                let rebuild = match &playing {
                    None => true,
                    Some(open) => {
                        open.lost.load(Ordering::Relaxed) || wanted.as_deref() != open.name.as_deref()
                    }
                };
                if rebuild {
                    // Drop first. The old device may be gone, and building the
                    // new stream while the old callback is still running would
                    // mean two readers on a ring that allows one.
                    let had = playing.take().is_some();
                    match build(
                        Arc::clone(&consumer),
                        Arc::clone(&clock),
                        Arc::clone(&thread_status),
                    ) {
                        Ok(open) => {
                            if had {
                                thread_status.swaps.fetch_add(1, Ordering::Relaxed);
                            }
                            thread_status.silent.store(false, Ordering::Relaxed);
                            playing = Some(open);
                        }
                        Err(message) => {
                            // No output at all: a machine with nothing plugged
                            // in, or a device that has not come back yet. The
                            // engine goes on mixing and this looks again in
                            // half a second.
                            thread_status.failed(message);
                        }
                    }
                }
                std::thread::sleep(WATCH);
            }
        });

        DeviceSink {
            stop,
            status,
            owner: Some(owner),
        }
    }

    pub fn status(&self) -> &Arc<Status> {
        &self.status
    }
}

impl Drop for DeviceSink {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(owner) = self.owner.take() {
            let _ = owner.join();
        }
    }
}

/// A stream and the two things the owning thread needs to know about it.
struct Playing {
    /// Dropping this stops the callback. Never read; held to keep it alive.
    _stream: cpal::Stream,
    /// The device this was opened on, so a change of default is noticed.
    name: Option<String>,
    /// Set by the error callback when the device has gone.
    lost: Arc<AtomicBool>,
}

fn default_output_name() -> Option<String> {
    let device = cpal::default_host().default_output_device()?;
    device
        .description()
        .ok()
        .map(|description| description.name().to_string())
}

/// The config to open with: 48 kHz and stereo if the device will take them,
/// because matching the mix means no conversion at all.
fn choose(device: &cpal::Device) -> Result<SupportedStreamConfig, String> {
    let default = device
        .default_output_config()
        .map_err(|error| format!("the output has no usable configuration: {error}"))?;
    if let Ok(configs) = device.supported_output_configs() {
        let exact = configs
            .filter(|range| range.sample_format() == SampleFormat::F32)
            .filter(|range| range.channels() as usize == CHANNELS)
            .find_map(|range| range.try_with_sample_rate(ENGINE_HZ));
        if let Some(exact) = exact {
            return Ok(exact);
        }
    }
    Ok(default)
}

fn build(
    consumer: Arc<Consumer>,
    clock: Arc<Clock>,
    status: Arc<Status>,
) -> Result<Playing, String> {
    let device = cpal::default_host()
        .default_output_device()
        .ok_or_else(|| "there is no audio output on this machine".to_string())?;
    let name = device
        .description()
        .ok()
        .map(|description| description.name().to_string());
    let supported = choose(&device)?;
    let sample_format = supported.sample_format();
    if sample_format != SampleFormat::F32 {
        // Every backend this ships to offers f32. Converting to i16 in the
        // callback would be easy enough to add, and adding it before anything
        // needs it would be guessing at what it should sound like.
        return Err(format!(
            "the output wants {sample_format} samples, which this build does not write"
        ));
    }
    let config = StreamConfig {
        buffer_size: BufferSize::Default,
        ..supported.config()
    };

    let lost = Arc::new(AtomicBool::new(false));
    let error_lost = Arc::clone(&lost);
    let error_status = Arc::clone(&status);
    let mut playback = Playback::new(consumer, clock, &config);
    let stream = device
        .build_output_stream::<f32, _, _>(
            config,
            move |out, info| playback.fill(out, info),
            move |error| {
                *error_status.last_error.lock().unwrap() = Some(error.to_string());
                // Only a device that has gone is worth rebuilding for, and the
                // list is short on purpose. Every other error a backend reports
                // here is one it recovers from itself: ALSA delivers `Xrun` on
                // an underrun and then calls `prepare()` and carries on, and
                // `DeviceChanged` means it has already rerouted. Treating those
                // as a dead stream would tear down a working output and replace
                // it with a few hundred milliseconds of silence — turning every
                // buffer underrun into a real gap.
                if matches!(
                    error.kind(),
                    ErrorKind::DeviceNotAvailable | ErrorKind::HostUnavailable
                ) {
                    error_lost.store(true, Ordering::Relaxed);
                }
            },
            Some(BUILD_TIMEOUT),
        )
        .map_err(|error| format!("cannot open the audio output: {error}"))?;
    stream
        .play()
        .map_err(|error| format!("the audio output would not start: {error}"))?;

    Ok(Playing {
        _stream: stream,
        name,
        lost,
    })
}

/// Everything the callback owns.
///
/// Every field is sized and allocated here, before the stream starts. Nothing
/// in [`Playback::fill`] allocates, locks or touches a file — see
/// [`crate::realtime`] for why that is a rule rather than a preference.
struct Playback {
    consumer: Arc<Consumer>,
    clock: Arc<Clock>,
    /// Device channels, which is not always two.
    channels: usize,
    /// Engine frames per device frame. Exactly 1 when the device took 48 kHz,
    /// which is the case that skips the interpolation entirely.
    ratio: f64,
    /// Engine frames, read out of the ring in one go and then interpolated.
    scratch: Vec<f32>,
    /// Where between two engine frames the next device frame falls, kept across
    /// callbacks so the resampling does not restart every buffer.
    fraction: f64,
    /// The two engine frames the interpolation is currently between. Held
    /// across callbacks, which is what lets a callback pop **exactly** the
    /// frames it consumes: popping a lookahead frame and dropping it would
    /// take one extra frame out of the ring every buffer, and the clock counts
    /// what leaves the ring, so it would run fast for ever.
    previous: [f32; CHANNELS],
    next: [f32; CHANNELS],
    /// Whether those two hold anything yet.
    primed: bool,
}

impl Playback {
    fn new(consumer: Arc<Consumer>, clock: Arc<Clock>, config: &StreamConfig) -> Playback {
        let ratio = f64::from(ENGINE_HZ) / f64::from(config.sample_rate.max(1));
        Playback {
            consumer,
            clock,
            channels: (config.channels as usize).max(1),
            ratio,
            // Two extra frames for priming the interpolation on the first
            // callback after a start.
            scratch: vec![0.0; (MAX_CALLBACK_FRAMES + 2) * CHANNELS],
            fraction: 0.0,
            previous: [0.0; CHANNELS],
            next: [0.0; CHANNELS],
            primed: false,
        }
    }

    fn fill(&mut self, out: &mut [f32], info: &cpal::OutputCallbackInfo) {
        out.fill(0.0);
        // How far ahead of the speaker this callback runs, straight from the
        // backend. It is the difference between the playhead being where the
        // sound is and being a buffer ahead of it.
        let stamps = info.timestamp();
        if let Some(ahead) = stamps.playback.checked_duration_since(stamps.callback) {
            self.clock
                .set_latency((ahead.as_secs_f64() * f64::from(ENGINE_HZ)) as u64);
        }
        // A seek that arrives while the ring is empty still has to take effect,
        // and this callback may never reach a `pop`.
        self.consumer.take_flush();

        let frames = out.len() / self.channels;
        if frames == 0 {
            return;
        }
        let (taken, wanted) = if self.ratio == 1.0 {
            self.straight(out, frames)
        } else {
            self.resampled(out, frames)
        };
        self.clock.advance(taken as u64);
        if taken < wanted {
            // The rest of `out` is already zero. Counting the hole rather than
            // hiding it is what makes an underrun something the meter can see.
            self.clock.starve((wanted - taken) as u64);
        }
    }

    /// The device took 48 kHz: one ring frame is one device frame.
    ///
    /// Both numbers are engine frames, and here they are also device frames.
    fn straight(&mut self, out: &mut [f32], frames: usize) -> (usize, usize) {
        let wanted = frames.min(MAX_CALLBACK_FRAMES);
        let taken = self.consumer.pop(&mut self.scratch[..wanted * CHANNELS]);
        for frame in 0..taken {
            let sample = frame_at(&self.scratch, frame);
            write_frame(out, self.channels, frame, &sample);
        }
        (taken, wanted)
    }

    /// The device wanted something else: interpolate between engine frames.
    ///
    /// Linear, which is the right amount of cleverness for a conversion that
    /// only happens on a device that will not do 48 kHz.
    ///
    /// How many engine frames a buffer costs is worked out first rather than
    /// discovered, so the whole block comes out of the ring in one pop and not
    /// one frame at a time. The count is exact: the fraction advances by
    /// `ratio` per output frame and drops by one per input frame, so the input
    /// frames used are `floor(fraction + frames * ratio)`.
    ///
    /// Returns engine frames taken and engine frames wanted.
    fn resampled(&mut self, out: &mut [f32], frames: usize) -> (usize, usize) {
        // Two more on the first callback after a start or a device swap, to
        // fill the pair the interpolation walks between.
        let priming = if self.primed { 0 } else { 2 };
        let advances = (self.fraction + frames as f64 * self.ratio).floor() as usize;
        let wanted = (advances + priming).min(MAX_CALLBACK_FRAMES);

        if !self.primed && self.consumer.filled() < 2 {
            // Not enough in the ring to start interpolating on, so take none of
            // it. Popping the one frame that is there would put it somewhere
            // the next callback cannot reach — the priming below overwrites
            // both held frames from a fresh pop — while the clock counted it as
            // played. One frame out of the ring that nobody hears is a clock
            // that runs ahead of the sound, every time playback starts starved.
            return (0, wanted);
        }
        let have = self.consumer.pop(&mut self.scratch[..wanted * CHANNELS]);

        let mut index = 0usize;
        if !self.primed {
            debug_assert!(have >= 2, "the ring said it held a pair");
            self.previous = frame_at(&self.scratch, 0);
            self.next = frame_at(&self.scratch, 1);
            self.primed = true;
            index = 2;
        }

        for frame in 0..frames {
            let mut blended = [0.0f32; CHANNELS];
            for channel in 0..CHANNELS {
                let a = self.previous[channel];
                let b = self.next[channel];
                blended[channel] = a + (b - a) * self.fraction as f32;
            }
            write_frame(out, self.channels, frame, &blended);
            self.fraction += self.ratio;
            while self.fraction >= 1.0 {
                self.previous = self.next;
                if index < have {
                    self.next = frame_at(&self.scratch, index);
                    index += 1;
                } else {
                    // Out of input. Holding the last frame rather than jumping
                    // to zero: what is missing is already counted as an
                    // underrun, and a step to silence is the louder of the two
                    // ways to be wrong.
                    self.fraction = 0.0;
                    return (have, wanted);
                }
                self.fraction -= 1.0;
            }
        }
        (have, wanted)
    }
}

fn frame_at(samples: &[f32], frame: usize) -> [f32; CHANNELS] {
    let mut out = [0.0f32; CHANNELS];
    out.copy_from_slice(&samples[frame * CHANNELS..frame * CHANNELS + CHANNELS]);
    out
}

/// Put a stereo frame into a device frame of `channels`.
///
/// Mono gets the average rather than the left channel, because taking one side
/// of a stereo mix silences anything panned to the other. More than two
/// channels get the pair in front and silence behind: guessing at a surround
/// downmix would be inventing a sound the render does not make.
fn write_frame(out: &mut [f32], channels: usize, frame: usize, stereo: &[f32]) {
    let base = frame * channels;
    if base + channels > out.len() {
        return;
    }
    match channels {
        1 => out[base] = (stereo[0] + stereo[1]) * 0.5,
        _ => {
            out[base] = stereo[0];
            out[base + 1] = stereo[1];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::realtime::Ring;

    fn config(rate: u32, channels: u16) -> StreamConfig {
        StreamConfig {
            channels,
            sample_rate: rate,
            buffer_size: BufferSize::Default,
        }
    }

    /// A playback and the producer feeding it, with no device anywhere.
    fn rig(rate: u32, channels: u16) -> (Playback, crate::realtime::Producer, Arc<Clock>) {
        let (producer, consumer) = Ring::new(1 << 15);
        let clock = Arc::new(Clock::new());
        let playback = Playback::new(Arc::new(consumer), Arc::clone(&clock), &config(rate, channels));
        (playback, producer, clock)
    }

    fn tone(frames: usize) -> Vec<f32> {
        (0..frames * CHANNELS).map(|index| index as f32).collect()
    }

    #[test]
    fn a_device_at_the_engine_rate_is_not_resampled_at_all() {
        let (mut playback, producer, _clock) = rig(ENGINE_HZ, 2);
        assert_eq!(playback.ratio, 1.0);
        producer.push(&tone(8));
        let mut out = vec![0.0f32; 8 * 2];
        let (taken, wanted) = playback.straight(&mut out, 8);
        assert_eq!((taken, wanted), (8, 8));
        assert_eq!(out, tone(8), "the samples reach the device untouched");
    }

    #[test]
    fn a_resampling_device_takes_exactly_the_frames_it_uses() {
        // The number this test exists for. The clock counts what leaves the
        // ring, so a callback that pops one lookahead frame it does not use
        // makes the playhead run fast by a frame a buffer — a second of drift
        // every twenty seconds, which is the failure the whole crate is meant
        // to prevent.
        let (mut playback, producer, _clock) = rig(44_100, 2);
        let ratio = f64::from(ENGINE_HZ) / 44_100.0;

        let buffers = 500usize;
        let per_buffer = 512usize;
        let mut consumed = 0usize;
        let mut out = vec![0.0f32; per_buffer * 2];
        for _ in 0..buffers {
            // Kept well fed, so nothing here is an underrun.
            producer.push(&tone(1_024));
            let (taken, wanted) = playback.resampled(&mut out, per_buffer);
            assert_eq!(taken, wanted, "the ring was full enough to serve it");
            consumed += taken;
        }

        // Two frames of that were the priming pair, which is a one off.
        let expected = (buffers * per_buffer) as f64 * ratio + 2.0;
        assert!(
            (consumed as f64 - expected).abs() <= 1.0,
            "took {consumed} engine frames where {expected:.1} were due"
        );
    }

    #[test]
    fn a_starved_resampler_reports_the_hole_rather_than_inventing_input() {
        let (mut playback, producer, _clock) = rig(44_100, 2);
        producer.push(&tone(10));
        let mut out = vec![0.0f32; 512 * 2];
        let (taken, wanted) = playback.resampled(&mut out, 512);
        assert_eq!(taken, 10, "it used what there was");
        assert!(wanted > taken, "and said how much was missing");
    }

    #[test]
    fn a_mono_output_hears_both_sides_rather_than_one_of_them() {
        let mut out = vec![0.0f32; 2];
        write_frame(&mut out, 1, 0, &[1.0, 0.0]);
        write_frame(&mut out, 1, 1, &[0.0, 1.0]);
        // Taking the left channel would have made the second frame silent, and
        // anything panned right would vanish on a mono output.
        assert_eq!(out, vec![0.5, 0.5]);
    }

    #[test]
    fn a_surround_output_gets_the_front_pair_and_silence_behind() {
        let mut out = vec![9.0f32; 6];
        write_frame(&mut out, 6, 0, &[0.25, 0.75]);
        assert_eq!(out[0], 0.25);
        assert_eq!(out[1], 0.75);
        // The rest is left as the caller had it, which is the zeroed buffer.
        assert_eq!(&out[2..], &[9.0, 9.0, 9.0, 9.0]);
    }

    #[test]
    fn a_frame_that_would_run_off_the_end_writes_nothing() {
        let mut out = vec![0.0f32; 3];
        write_frame(&mut out, 2, 1, &[1.0, 1.0]);
        assert_eq!(out, vec![0.0, 0.0, 0.0], "the last frame is incomplete");
    }
}
