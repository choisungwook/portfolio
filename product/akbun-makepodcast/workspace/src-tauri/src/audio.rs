//! Devices, capture and playback.
//!
//! This is the only module that talks to cpal and hound. It deliberately knows
//! nothing about tauri: the engine exposes `poll_capture` and `poll_playback`,
//! and lib.rs runs a timer that turns what they return into window events. That
//! split is what lets this file be compiled and reasoned about without a
//! webview, and it keeps the audio callbacks free of anything that could block.
//!
//! Two rules govern everything below.
//!
//! An audio callback runs on a realtime thread. It must not allocate, block on
//! a lock it can lose, or wait on a file. Playback therefore reads the take on
//! its own thread and hands samples over through a fixed size queue, and the
//! callback only ever pops from it.
//!
//! A device can vanish while it is open. Every entry point returns a `Result`
//! with a message the page can show, because an unplugged interface mid take is
//! normal operation, not a bug.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample, SupportedStreamConfig};
use makepodcast_recorder::{
    f32_to_fixed, fixed_to_f32, map_channels, Meter, PeakAccumulator, SampleQueue, FRAMES_PER_PEAK,
    TAKE_BITS,
};
use serde::Serialize;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

// cpal 0.18 requires a host's Stream to be Send and Sync, which is what lets a
// stream be held in the engine behind the same lock as everything else. If that
// ever regresses this stops compiling here rather than somewhere less obvious.
cpal::assert_stream_send!(cpal::Stream);

/// Roughly a second of audio between the reader thread and the output callback.
/// Long enough that a slow disk does not cause a dropout, short enough that
/// stopping playback is not audibly late.
const PLAYBACK_QUEUE_SECONDS: usize = 1;

/// The writer buffer. Recording writes from the audio callback, so the point is
/// to make the syscall rare: a megabyte is several seconds of 24 bit stereo.
const WRITER_BUFFER_BYTES: usize = 1 << 20;

/// One audio interface or microphone as the page shows it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    /// The cpal device id in its string form. Selection is stored by id and not
    /// by name because two identical interfaces report the same name.
    pub id: String,
    pub name: String,
    pub channels: u16,
    pub sample_rate: u32,
    pub is_default: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Devices {
    pub inputs: Vec<DeviceInfo>,
    pub outputs: Vec<DeviceInfo>,
}

/// What the page learns when a recording starts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingInfo {
    pub path: String,
    pub device: String,
    pub sample_rate: u32,
    pub channels: u16,
    /// How many frames one waveform column covers, so the page can turn a
    /// column index into a position on the timeline.
    pub frames_per_peak: usize,
}

/// A finished take.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Take {
    pub path: String,
    pub name: String,
    pub seconds: f64,
    pub sample_rate: u32,
    pub channels: u16,
    pub frames_per_peak: usize,
    /// The whole waveform, so the page can redraw it after a resize or a
    /// restart without reading the file again.
    pub peaks: Vec<f32>,
}

/// One poll of a running capture.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureUpdate {
    /// Only the columns produced since the previous poll. The page appends.
    pub peaks: Vec<f32>,
    pub meter: Meter,
    pub clipped: bool,
    pub seconds: f64,
}

/// One poll of a running playback.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackUpdate {
    pub seconds: f64,
    pub meter: Meter,
    pub finished: bool,
}

/// Shared between the capture callback and the poller.
#[derive(Debug)]
struct CaptureShared {
    accumulator: PeakAccumulator,
    meter: Meter,
    clipped: bool,
}

struct Recording {
    // Dropping the stream is what stops capture, so it is held even though
    // nothing calls a method on it after `play`.
    _stream: cpal::Stream,
    writer: Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>,
    shared: Arc<Mutex<CaptureShared>>,
    /// How many columns the poller has already sent to the page.
    sent_peaks: usize,
    path: PathBuf,
    sample_rate: u32,
    channels: u16,
}

/// Shared between the output callback, the reader thread and the poller.
#[derive(Debug, Default)]
struct PlaybackShared {
    frames_played: AtomicU64,
    /// The loudest block since the last poll, as raw bits of two f32 values.
    /// Atomics rather than a lock because the output callback writes this.
    peak_bits: AtomicU32,
    rms_bits: AtomicU32,
    /// The reader has reached the end of the file. Playback is over once the
    /// queue has drained as well.
    eof: AtomicBool,
    stop: AtomicBool,
}

struct Playback {
    _stream: cpal::Stream,
    shared: Arc<PlaybackShared>,
    queue: Arc<Mutex<SampleQueue>>,
    volume: Arc<AtomicU32>,
    sample_rate: u32,
    reader: Option<std::thread::JoinHandle<()>>,
}

/// Everything the app can do with the sound card. One instance lives behind a
/// mutex in tauri state, so only one recording and one playback exist at a time.
#[derive(Default)]
pub struct AudioEngine {
    recording: Option<Recording>,
    playback: Option<Playback>,
}

impl AudioEngine {
    pub fn is_recording(&self) -> bool {
        self.recording.is_some()
    }

    pub fn is_playing(&self) -> bool {
        self.playback.is_some()
    }

    /// Start capturing into `path`.
    ///
    /// `device_id` is what settings stored. A device that is no longer present
    /// falls back to the system default rather than failing, because an
    /// interface that was unplugged since the last run is the common case and
    /// the user would otherwise face an error before they can pick another.
    pub fn start_recording(
        &mut self,
        device_id: Option<&str>,
        path: &Path,
    ) -> Result<RecordingInfo, String> {
        if self.recording.is_some() {
            return Err("Already recording.".to_string());
        }
        self.stop_playback();

        let host = cpal::default_host();
        let device = find_device(&host, device_id, true)
            .ok_or_else(|| "No input device. Connect an interface or a microphone.".to_string())?;
        let name = device_name(&device);
        let config = device
            .default_input_config()
            .map_err(|error| format!("{name} has no usable input format: {error}"))?;
        let channels = config.channels();
        let sample_rate = config.sample_rate();

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("cannot create {parent:?}: {error}"))?;
        }
        let file = File::create(path).map_err(|error| format!("cannot create {path:?}: {error}"))?;
        let spec = hound::WavSpec {
            channels,
            sample_rate,
            bits_per_sample: TAKE_BITS,
            sample_format: hound::SampleFormat::Int,
        };
        let writer = hound::WavWriter::new(
            BufWriter::with_capacity(WRITER_BUFFER_BYTES, file),
            spec,
        )
        .map_err(|error| format!("cannot write {path:?}: {error}"))?;

        let writer = Arc::new(Mutex::new(Some(writer)));
        let shared = Arc::new(Mutex::new(CaptureShared {
            accumulator: PeakAccumulator::new(channels, FRAMES_PER_PEAK),
            meter: Meter::default(),
            clipped: false,
        }));

        let stream = build_capture_stream(&device, &config, writer.clone(), shared.clone())
            .map_err(|error| format!("cannot open {name}: {error}"))?;
        stream
            .play()
            .map_err(|error| format!("cannot start {name}: {error}"))?;

        self.recording = Some(Recording {
            _stream: stream,
            writer,
            shared,
            sent_peaks: 0,
            path: path.to_path_buf(),
            sample_rate,
            channels,
        });

        Ok(RecordingInfo {
            path: path.to_string_lossy().to_string(),
            device: name,
            sample_rate,
            channels,
            frames_per_peak: FRAMES_PER_PEAK,
        })
    }

    /// The columns and levels produced since the previous call.
    pub fn poll_capture(&mut self) -> Option<CaptureUpdate> {
        let recording = self.recording.as_mut()?;
        let mut shared = recording.shared.lock().ok()?;
        let peaks = shared.accumulator.peaks_from(recording.sent_peaks).to_vec();
        recording.sent_peaks += peaks.len();
        let meter = shared.meter;
        let clipped = shared.clipped;
        let seconds = shared.accumulator.seconds(recording.sample_rate);
        // Reset so the next poll reports its own window rather than the loudest
        // moment of the whole take, which would leave the bar pinned.
        shared.meter = Meter::default();
        Some(CaptureUpdate {
            peaks,
            meter,
            clipped,
            seconds,
        })
    }

    /// Stop capture and close the file.
    ///
    /// The stream is dropped first. cpal waits for an in flight callback to
    /// return, so by the time the writer is taken nothing else can hold it, and
    /// finalize can write the header over a file no one is appending to.
    pub fn stop_recording(&mut self) -> Result<Take, String> {
        let recording = self
            .recording
            .take()
            .ok_or_else(|| "Not recording.".to_string())?;
        let Recording {
            _stream,
            writer,
            shared,
            path,
            sample_rate,
            channels,
            ..
        } = recording;
        drop(_stream);

        let writer = writer
            .lock()
            .map_err(|_| "the recording thread failed".to_string())?
            .take();
        if let Some(writer) = writer {
            writer
                .finalize()
                .map_err(|error| format!("cannot finish {path:?}: {error}"))?;
        }

        let shared = shared.lock().map_err(|_| "the recording thread failed")?;
        Ok(Take {
            path: path.to_string_lossy().to_string(),
            name: file_name(&path),
            seconds: shared.accumulator.seconds(sample_rate),
            sample_rate,
            channels,
            frames_per_peak: FRAMES_PER_PEAK,
            peaks: shared.accumulator.peaks().to_vec(),
        })
    }

    /// Play a take through the chosen output device.
    ///
    /// The output stream runs at the take's own sample rate so nothing has to
    /// be resampled. Every interface that recorded the take can play it back,
    /// and a device that genuinely cannot is reported rather than guessed at.
    pub fn start_playback(
        &mut self,
        path: &Path,
        device_id: Option<&str>,
        volume: f32,
    ) -> Result<(), String> {
        if self.recording.is_some() {
            return Err("Stop recording first.".to_string());
        }
        self.stop_playback();

        let reader = hound::WavReader::open(path)
            .map_err(|error| format!("cannot read {path:?}: {error}"))?;
        let spec = reader.spec();

        let host = cpal::default_host();
        let device = find_device(&host, device_id, false)
            .ok_or_else(|| "No output device. Connect headphones or speakers.".to_string())?;
        let name = device_name(&device);
        let default_config = device
            .default_output_config()
            .map_err(|error| format!("{name} has no usable output format: {error}"))?;
        let out_channels = default_config.channels();

        let config = cpal::StreamConfig {
            channels: out_channels,
            sample_rate: spec.sample_rate,
            buffer_size: cpal::BufferSize::Default,
        };

        let queue = Arc::new(Mutex::new(SampleQueue::new(
            spec.sample_rate as usize * out_channels as usize * PLAYBACK_QUEUE_SECONDS,
        )));
        let shared = Arc::new(PlaybackShared::default());
        let volume = Arc::new(AtomicU32::new(volume.clamp(0.0, 1.0).to_bits()));

        let reader_handle = spawn_reader(reader, out_channels, queue.clone(), shared.clone());

        let stream = build_playback_stream(
            &device,
            &config,
            default_config.sample_format(),
            queue.clone(),
            shared.clone(),
            volume.clone(),
            out_channels,
        )
        .map_err(|error| {
            shared.stop.store(true, Ordering::Release);
            format!("{name} cannot play {} Hz: {error}", spec.sample_rate)
        })?;
        stream
            .play()
            .map_err(|error| format!("cannot start {name}: {error}"))?;

        self.playback = Some(Playback {
            _stream: stream,
            shared,
            queue,
            volume,
            sample_rate: spec.sample_rate,
            reader: Some(reader_handle),
        });
        Ok(())
    }

    /// Where the playhead is and how loud the output is, or `None` when nothing
    /// is playing. `finished` is true on the poll that ends playback.
    pub fn poll_playback(&mut self) -> Option<PlaybackUpdate> {
        let playback = self.playback.as_ref()?;
        let frames = playback.shared.frames_played.load(Ordering::Acquire);
        let seconds = if playback.sample_rate == 0 {
            0.0
        } else {
            frames as f64 / playback.sample_rate as f64
        };
        let meter = Meter {
            peak: f32::from_bits(playback.shared.peak_bits.swap(0, Ordering::AcqRel)),
            rms: f32::from_bits(playback.shared.rms_bits.swap(0, Ordering::AcqRel)),
        };
        let drained = playback
            .queue
            .lock()
            .map(|queue| queue.is_empty())
            .unwrap_or(true);
        let finished = playback.shared.eof.load(Ordering::Acquire) && drained;

        if finished {
            self.stop_playback();
        }
        Some(PlaybackUpdate {
            seconds,
            meter,
            finished,
        })
    }

    /// Live, so moving the slider during playback is heard immediately.
    pub fn set_volume(&self, volume: f32) {
        if let Some(playback) = self.playback.as_ref() {
            playback
                .volume
                .store(volume.clamp(0.0, 1.0).to_bits(), Ordering::Release);
        }
    }

    pub fn stop_playback(&mut self) {
        if let Some(mut playback) = self.playback.take() {
            // Signal first, then drop the stream, then join. The reader parks on
            // a full queue, so it has to be told to leave before anything waits
            // on it or stopping a paused playback would hang.
            playback.shared.stop.store(true, Ordering::Release);
            drop(playback._stream);
            if let Some(reader) = playback.reader.take() {
                let _ = reader.join();
            }
        }
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        self.stop_playback();
    }
}

/// Every input or output the host can see.
///
/// A device that errors while being described is skipped rather than failing
/// the whole list: one bad driver should not hide the interface next to it.
pub fn list_devices() -> Devices {
    let host = cpal::default_host();
    let default_input = host
        .default_input_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let default_output = host
        .default_output_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());

    let mut devices = Devices::default();
    let Ok(all) = host.devices() else {
        return devices;
    };
    for device in all {
        let Ok(id) = device.id() else { continue };
        let id = id.to_string();
        let name = device_name(&device);
        if let Ok(config) = device.default_input_config() {
            devices.inputs.push(DeviceInfo {
                id: id.clone(),
                name: name.clone(),
                channels: config.channels(),
                sample_rate: config.sample_rate(),
                is_default: Some(&id) == default_input.as_ref(),
            });
        }
        if let Ok(config) = device.default_output_config() {
            devices.outputs.push(DeviceInfo {
                id: id.clone(),
                name,
                channels: config.channels(),
                sample_rate: config.sample_rate(),
                is_default: Some(&id) == default_output.as_ref(),
            });
        }
    }
    devices
}

fn device_name(device: &cpal::Device) -> String {
    device.to_string()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// The stored device, or the system default when it is gone.
fn find_device(host: &cpal::Host, device_id: Option<&str>, input: bool) -> Option<cpal::Device> {
    let chosen = device_id
        .filter(|id| !id.is_empty())
        .and_then(|id| cpal::DeviceId::from_str(id).ok())
        .and_then(|id| host.device_by_id(&id))
        .filter(|device| {
            if input {
                device.supports_input()
            } else {
                device.supports_output()
            }
        });
    chosen.or_else(|| {
        if input {
            host.default_input_device()
        } else {
            host.default_output_device()
        }
    })
}

type WriterHandle = Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>;

/// Build the capture stream for whichever sample format the device speaks.
///
/// Every format is converted to f32 in the callback and written back out as 24
/// bit, so the rest of the app sees one representation. DSD devices are refused
/// because a one bit stream is not a WAV.
fn build_capture_stream(
    device: &cpal::Device,
    config: &SupportedStreamConfig,
    writer: WriterHandle,
    shared: Arc<Mutex<CaptureShared>>,
) -> Result<cpal::Stream, cpal::Error> {
    let format = config.sample_format();
    if format.is_dsd() {
        return Err(cpal::Error::with_message(
            cpal::ErrorKind::UnsupportedConfig,
            "DSD devices cannot be recorded to WAV",
        ));
    }
    let stream_config: cpal::StreamConfig = (*config).into();
    match format {
        SampleFormat::I8 => capture::<i8>(device, &stream_config, writer, shared),
        SampleFormat::I16 => capture::<i16>(device, &stream_config, writer, shared),
        SampleFormat::I32 => capture::<i32>(device, &stream_config, writer, shared),
        SampleFormat::F32 => capture::<f32>(device, &stream_config, writer, shared),
        SampleFormat::F64 => capture::<f64>(device, &stream_config, writer, shared),
        other => Err(cpal::Error::with_message(
            cpal::ErrorKind::UnsupportedConfig,
            format!("unsupported sample format {other}"),
        )),
    }
}

fn capture<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    writer: WriterHandle,
    shared: Arc<Mutex<CaptureShared>>,
) -> Result<cpal::Stream, cpal::Error>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let mut block = Vec::<f32>::new();
    device.build_input_stream(
        *config,
        move |input: &[T], _: &cpal::InputCallbackInfo| {
            block.clear();
            block.reserve(input.len());
            block.extend(input.iter().map(|&sample| f32::from_sample(sample)));

            // The writer lock is only ever contested at stop, and stop drops
            // the stream before it takes the writer, so this never waits.
            if let Ok(mut guard) = writer.lock() {
                if let Some(writer) = guard.as_mut() {
                    for &sample in block.iter() {
                        let _ = writer.write_sample(f32_to_fixed(sample, TAKE_BITS));
                    }
                }
            }

            if let Ok(mut state) = shared.lock() {
                let meter = Meter::of(&block);
                state.meter = state.meter.merge(meter);
                state.clipped |= meter.is_clipping();
                state.accumulator.push(&block);
            }
        },
        |error| eprintln!("capture: {error}"),
        None,
    )
}

/// Read the take on its own thread and feed the queue.
///
/// It parks when the queue is full rather than reading the whole file into
/// memory, so an hour long take costs a second of audio in RAM and not a
/// gigabyte.
fn spawn_reader(
    mut reader: hound::WavReader<std::io::BufReader<File>>,
    out_channels: u16,
    queue: Arc<Mutex<SampleQueue>>,
    shared: Arc<PlaybackShared>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let spec = reader.spec();
        let in_channels = spec.channels.max(1) as usize;
        let frames_per_read = 4096;
        loop {
            if shared.stop.load(Ordering::Acquire) {
                return;
            }
            let wanted = frames_per_read * in_channels;
            let block = read_block(&mut reader, wanted);
            if block.is_empty() {
                shared.eof.store(true, Ordering::Release);
                return;
            }
            let mut mapped = map_channels(&block, in_channels, out_channels as usize);
            let mut offset = 0;
            while offset < mapped.len() {
                if shared.stop.load(Ordering::Acquire) {
                    return;
                }
                let accepted = queue
                    .lock()
                    .map(|mut queue| queue.push(&mapped[offset..]))
                    .unwrap_or(0);
                offset += accepted;
                if offset < mapped.len() {
                    std::thread::sleep(std::time::Duration::from_millis(5));
                }
            }
            mapped.clear();
        }
    })
}

/// One block of the file as full scale f32, whatever the file stores.
fn read_block(reader: &mut hound::WavReader<std::io::BufReader<File>>, wanted: usize) -> Vec<f32> {
    let spec = reader.spec();
    let bits = spec.bits_per_sample;
    match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .take(wanted)
            .filter_map(Result::ok)
            .collect(),
        hound::SampleFormat::Int => reader
            .samples::<i32>()
            .take(wanted)
            .filter_map(Result::ok)
            .map(|sample| fixed_to_f32(sample, bits))
            .collect(),
    }
}

#[allow(clippy::too_many_arguments)]
fn build_playback_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    format: SampleFormat,
    queue: Arc<Mutex<SampleQueue>>,
    shared: Arc<PlaybackShared>,
    volume: Arc<AtomicU32>,
    channels: u16,
) -> Result<cpal::Stream, cpal::Error> {
    match format {
        SampleFormat::I8 => play::<i8>(device, config, queue, shared, volume, channels),
        SampleFormat::I16 => play::<i16>(device, config, queue, shared, volume, channels),
        SampleFormat::I32 => play::<i32>(device, config, queue, shared, volume, channels),
        SampleFormat::F32 => play::<f32>(device, config, queue, shared, volume, channels),
        SampleFormat::F64 => play::<f64>(device, config, queue, shared, volume, channels),
        other => Err(cpal::Error::with_message(
            cpal::ErrorKind::UnsupportedConfig,
            format!("unsupported sample format {other}"),
        )),
    }
}

fn play<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    queue: Arc<Mutex<SampleQueue>>,
    shared: Arc<PlaybackShared>,
    volume: Arc<AtomicU32>,
    channels: u16,
) -> Result<cpal::Stream, cpal::Error>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = channels.max(1) as usize;
    let mut block = Vec::<f32>::new();
    device.build_output_stream(
        *config,
        move |output: &mut [T], _: &cpal::OutputCallbackInfo| {
            if block.len() < output.len() {
                // Grows once, to the buffer size the host settled on. After the
                // first callback this allocates nothing.
                block.resize(output.len(), 0.0);
            }
            let wanted = output.len();
            let filled = queue
                .lock()
                .map(|mut queue| queue.pop(&mut block[..wanted]))
                .unwrap_or(0);
            // An underrun is silence, not the previous buffer played again.
            block[filled..wanted].fill(0.0);

            let gain = f32::from_bits(volume.load(Ordering::Acquire));
            for sample in block[..wanted].iter_mut() {
                *sample *= gain;
            }

            let meter = Meter::of(&block[..wanted]);
            merge_atomic_f32(&shared.peak_bits, meter.peak);
            merge_atomic_f32(&shared.rms_bits, meter.rms);
            shared
                .frames_played
                .fetch_add((filled / channels) as u64, Ordering::AcqRel);

            for (slot, &sample) in output.iter_mut().zip(block[..wanted].iter()) {
                *slot = T::from_sample(sample);
            }
        },
        |error| eprintln!("playback: {error}"),
        None,
    )
}

/// Keep the loudest value seen since the poller last read, without a lock the
/// output callback could block on.
fn merge_atomic_f32(cell: &AtomicU32, value: f32) {
    let mut current = cell.load(Ordering::Acquire);
    loop {
        if f32::from_bits(current) >= value {
            return;
        }
        match cell.compare_exchange_weak(
            current,
            value.to_bits(),
            Ordering::AcqRel,
            Ordering::Acquire,
        ) {
            Ok(_) => return,
            Err(seen) => current = seen,
        }
    }
}
