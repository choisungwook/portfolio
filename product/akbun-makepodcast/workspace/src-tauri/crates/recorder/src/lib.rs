//! The model behind the recorder.
//!
//! Everything here is plain arithmetic over sample buffers: settings, level
//! metering, the waveform accumulator that turns a stream of frames into one
//! column per bucket, the queue that carries a take from a disk reader to the
//! output callback, and the channel mapping between a file and a device.
//!
//! It knows nothing about cpal, hound or tauri, which is what lets the pull
//! request job test it on Linux without installing ALSA, GTK or WebKit.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// The folder created under the home Documents folder. Recordings and
/// settings.json both live in it. See adr/2026-08-settings-next-to-recordings.md.
pub const APP_DIR_NAME: &str = "akbun-makepodcast";

/// How many frames one waveform column covers. At 48 kHz this is about 93
/// columns per second, which is dense enough to see a syllable and cheap
/// enough to redraw the whole take on every frame.
pub const FRAMES_PER_PEAK: usize = 512;

/// The bottom of the level meters. Below this a signal is silence as far as
/// the display is concerned, and the bar sits empty.
pub const MIN_DB: f32 = -60.0;

/// Where recordings go and which devices to use.
///
/// `project_dir` is stored rather than derived so that a user who moves it
/// keeps the choice across restarts. An empty value means the default has not
/// been resolved yet, which is what first run looks like.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub project_dir: String,
    /// A cpal device id, as its `Display` form. Devices are matched by id and
    /// not by name, because two identical interfaces produce the same name.
    pub input_device: Option<String>,
    pub output_device: Option<String>,
    /// Playback gain, 0.0 to 1.0. Recording is never scaled: an app that
    /// quietly changes what it writes to disk cannot be trusted with a take.
    pub volume: f32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            project_dir: String::new(),
            input_device: None,
            output_device: None,
            volume: 1.0,
        }
    }
}

impl Settings {
    /// The folder to record into, falling back to the default under `home`.
    pub fn resolved_project_dir(&self, home: &Path) -> PathBuf {
        if self.project_dir.trim().is_empty() {
            default_project_dir(home)
        } else {
            PathBuf::from(&self.project_dir)
        }
    }

    /// Clamp what came in from the page. The slider cannot produce anything
    /// out of range, but a hand edited settings.json can, and a volume of 40
    /// would blow out the output stream.
    pub fn normalized(mut self) -> Self {
        if !self.volume.is_finite() {
            self.volume = 1.0;
        }
        self.volume = self.volume.clamp(0.0, 1.0);
        self
    }
}

/// `~/Documents/akbun-makepodcast`.
pub fn default_project_dir(home: &Path) -> PathBuf {
    home.join("Documents").join(APP_DIR_NAME)
}

/// Peak and RMS of one block, both as linear amplitudes.
///
/// Peak drives the clip indicator because a single sample over full scale is
/// already distortion. RMS drives the bar because it is what the ear hears.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct Meter {
    pub peak: f32,
    pub rms: f32,
}

impl Meter {
    pub fn of(samples: &[f32]) -> Self {
        if samples.is_empty() {
            return Self::default();
        }
        let mut peak = 0.0f32;
        let mut sum = 0.0f64;
        for &sample in samples {
            let magnitude = sample.abs();
            if magnitude > peak {
                peak = magnitude;
            }
            sum += (sample as f64) * (sample as f64);
        }
        Self {
            peak,
            rms: (sum / samples.len() as f64).sqrt() as f32,
        }
    }

    /// Combine the meters of two blocks. The poller emits at about 30 Hz while
    /// the audio callback runs far more often, so without this the display
    /// would show whichever block happened to be last and miss every peak in
    /// between.
    pub fn merge(self, other: Self) -> Self {
        Self {
            peak: self.peak.max(other.peak),
            rms: self.rms.max(other.rms),
        }
    }

    pub fn is_clipping(&self) -> bool {
        self.peak >= 0.999
    }
}

/// Linear amplitude to dBFS, floored at [`MIN_DB`] so that silence is a number
/// and not negative infinity.
pub fn to_db(level: f32) -> f32 {
    if level <= 0.0 {
        return MIN_DB;
    }
    (20.0 * level.log10()).max(MIN_DB)
}

/// Where a level sits on a [`MIN_DB`] to 0 dB meter, as 0.0 to 1.0.
pub fn meter_fraction(level: f32) -> f32 {
    ((to_db(level) - MIN_DB) / -MIN_DB).clamp(0.0, 1.0)
}

/// Turns an interleaved capture stream into one waveform column per bucket.
///
/// The audio callback pushes into this and the poller reads columns it has not
/// sent yet, so the page receives each column exactly once and appends rather
/// than redrawing from a growing array.
#[derive(Debug)]
pub struct PeakAccumulator {
    channels: usize,
    frames_per_peak: usize,
    frames_in_bucket: usize,
    peak_in_bucket: f32,
    peaks: Vec<f32>,
    frames: u64,
}

impl PeakAccumulator {
    pub fn new(channels: u16, frames_per_peak: usize) -> Self {
        Self {
            channels: channels.max(1) as usize,
            frames_per_peak: frames_per_peak.max(1),
            frames_in_bucket: 0,
            peak_in_bucket: 0.0,
            peaks: Vec::new(),
            frames: 0,
        }
    }

    /// One column is the loudest sample of any channel in the bucket. Taking
    /// the maximum across channels rather than channel one means a mic wired
    /// to the right input of an interface still draws a waveform.
    pub fn push(&mut self, interleaved: &[f32]) {
        for frame in interleaved.chunks(self.channels) {
            if frame.len() < self.channels {
                break; // A partial frame at the end of a block; wait for the rest.
            }
            for &sample in frame {
                let magnitude = sample.abs();
                if magnitude > self.peak_in_bucket {
                    self.peak_in_bucket = magnitude;
                }
            }
            self.frames += 1;
            self.frames_in_bucket += 1;
            if self.frames_in_bucket == self.frames_per_peak {
                self.peaks.push(self.peak_in_bucket);
                self.peak_in_bucket = 0.0;
                self.frames_in_bucket = 0;
            }
        }
    }

    pub fn peaks(&self) -> &[f32] {
        &self.peaks
    }

    /// The columns produced since the poller last read, so a poll that arrives
    /// late sends everything rather than skipping.
    pub fn peaks_from(&self, taken: usize) -> &[f32] {
        self.peaks.get(taken.min(self.peaks.len())..).unwrap_or(&[])
    }

    pub fn frames(&self) -> u64 {
        self.frames
    }

    pub fn seconds(&self, sample_rate: u32) -> f64 {
        if sample_rate == 0 {
            return 0.0;
        }
        self.frames as f64 / sample_rate as f64
    }
}

/// A fixed size sample queue between the thread that reads a take from disk
/// and the output callback that plays it.
///
/// The callback must not block, allocate or touch a file, so it only ever pops
/// from here. When the queue runs dry the callback writes silence, which is a
/// dropout rather than a crash.
#[derive(Debug)]
pub struct SampleQueue {
    data: Vec<f32>,
    read: usize,
    len: usize,
}

impl SampleQueue {
    pub fn new(capacity: usize) -> Self {
        Self {
            data: vec![0.0; capacity.max(1)],
            read: 0,
            len: 0,
        }
    }

    pub fn capacity(&self) -> usize {
        self.data.len()
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn free(&self) -> usize {
        self.capacity() - self.len
    }

    /// Accept as much as fits and report how much was taken, so the reader
    /// knows where to resume instead of losing the remainder.
    pub fn push(&mut self, samples: &[f32]) -> usize {
        let accepted = samples.len().min(self.free());
        for (offset, &sample) in samples[..accepted].iter().enumerate() {
            let slot = (self.read + self.len + offset) % self.capacity();
            self.data[slot] = sample;
        }
        self.len += accepted;
        accepted
    }

    /// Fill `out` and report how much was real audio. The rest is left
    /// untouched, so the caller zeroes the tail.
    pub fn pop(&mut self, out: &mut [f32]) -> usize {
        let taken = out.len().min(self.len);
        for slot in out.iter_mut().take(taken) {
            *slot = self.data[self.read];
            self.read = (self.read + 1) % self.capacity();
        }
        self.len -= taken;
        taken
    }
}

/// Rewrite a block of frames from a file's channel count to a device's.
///
/// Mono into stereo duplicates, so a single mic take is heard in both ears
/// rather than only the left. Stereo into mono averages. Anything else copies
/// the channels that exist and leaves the rest silent, which is the honest
/// answer when the mapping is not obvious.
pub fn map_channels(interleaved: &[f32], from: usize, to: usize) -> Vec<f32> {
    let from = from.max(1);
    let to = to.max(1);
    if from == to {
        return interleaved.to_vec();
    }
    let mut out = Vec::with_capacity(interleaved.len() / from * to);
    for frame in interleaved.chunks(from) {
        if frame.len() < from {
            break;
        }
        if to == 1 {
            out.push(frame.iter().sum::<f32>() / from as f32);
        } else if from == 1 {
            out.extend(std::iter::repeat_n(frame[0], to));
        } else {
            for channel in 0..to {
                out.push(frame.get(channel).copied().unwrap_or(0.0));
            }
        }
    }
    out
}

/// Takes are written as 24 bit fixed point.
///
/// 16 bit is the safe interchange format but leaves a podcast voice with
/// nothing to spare once it is levelled, and 32 bit float doubles the file for
/// headroom a microphone preamp cannot reach. 24 bit is what an interface
/// converts at, and every editor reads it.
pub const TAKE_BITS: u16 = 24;

/// Full scale amplitude to a fixed point sample of `bits` bits.
///
/// Clamped rather than wrapped: a sample over full scale is already distortion,
/// and wrapping would turn it into a click loud enough to hear across a room.
pub fn f32_to_fixed(sample: f32, bits: u16) -> i32 {
    let max = ((1i64 << (bits - 1)) - 1) as f32;
    if !sample.is_finite() {
        return 0;
    }
    (sample * max).round().clamp(-max, max) as i32
}

/// A fixed point sample of `bits` bits back to full scale amplitude.
pub fn fixed_to_f32(sample: i32, bits: u16) -> f32 {
    let max = ((1i64 << (bits - 1)) - 1) as f32;
    (sample as f32 / max).clamp(-1.0, 1.0)
}

/// The next unused `take-NNN.wav` in a folder.
///
/// Numbering continues past the highest name that is already there instead of
/// filling gaps, so deleting take-002 never makes the next recording overwrite
/// a file the user still has open in an editor.
pub fn next_take_name(existing: &[String]) -> String {
    let highest = existing
        .iter()
        .filter_map(|name| {
            let stem = name.strip_suffix(".wav")?;
            let digits = stem.strip_prefix("take-")?;
            digits.parse::<u32>().ok()
        })
        .max()
        .unwrap_or(0);
    format!("take-{:03}.wav", highest + 1)
}

/// Strip what a file name cannot carry, so a project name typed with a slash
/// does not create a folder one level up.
///
/// Every rejected character becomes a hyphen and runs of hyphens collapse.
/// Without the collapse a name of only dots would survive as a row of hyphens,
/// which is a folder the user did not ask for and cannot read.
pub fn sanitize_project_name(raw: &str) -> String {
    let mut cleaned = String::new();
    for character in raw.trim().chars() {
        if character.is_alphanumeric() || matches!(character, '_' | ' ') {
            cleaned.push(character);
        } else if !cleaned.ends_with('-') {
            cleaned.push('-');
        }
    }
    let cleaned = cleaned.trim().trim_matches('-').trim().to_string();
    if cleaned.is_empty() {
        "untitled".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_default_to_documents() {
        let settings = Settings::default();
        let dir = settings.resolved_project_dir(Path::new("/Users/akbun"));
        assert_eq!(dir, PathBuf::from("/Users/akbun/Documents/akbun-makepodcast"));
    }

    #[test]
    fn a_chosen_project_dir_wins_over_the_default() {
        let settings = Settings {
            project_dir: "/Volumes/audio/podcast".to_string(),
            ..Settings::default()
        };
        let dir = settings.resolved_project_dir(Path::new("/Users/akbun"));
        assert_eq!(dir, PathBuf::from("/Volumes/audio/podcast"));
    }

    #[test]
    fn a_blank_project_dir_is_treated_as_unset() {
        let settings = Settings {
            project_dir: "   ".to_string(),
            ..Settings::default()
        };
        assert_eq!(
            settings.resolved_project_dir(Path::new("/home/a")),
            PathBuf::from("/home/a/Documents/akbun-makepodcast")
        );
    }

    #[test]
    fn volume_is_clamped_and_nan_falls_back_to_full() {
        assert_eq!(
            Settings {
                volume: 4.0,
                ..Settings::default()
            }
            .normalized()
            .volume,
            1.0
        );
        assert_eq!(
            Settings {
                volume: -1.0,
                ..Settings::default()
            }
            .normalized()
            .volume,
            0.0
        );
        assert_eq!(
            Settings {
                volume: f32::NAN,
                ..Settings::default()
            }
            .normalized()
            .volume,
            1.0
        );
    }

    #[test]
    fn a_settings_file_from_an_older_version_still_loads() {
        // serde(default) is what makes a field added later a non event: an
        // existing settings.json has no volume and must not fail to parse.
        let settings: Settings = serde_json::from_str(r#"{"projectDir":"/tmp/p"}"#).unwrap();
        assert_eq!(settings.project_dir, "/tmp/p");
        assert_eq!(settings.volume, 1.0);
        assert_eq!(settings.input_device, None);
    }

    #[test]
    fn meter_reports_peak_and_rms() {
        let meter = Meter::of(&[0.5, -1.0, 0.5, -0.5]);
        assert_eq!(meter.peak, 1.0);
        assert!((meter.rms - 0.6614).abs() < 0.001);
    }

    #[test]
    fn an_empty_block_meters_as_silence() {
        assert_eq!(Meter::of(&[]), Meter::default());
    }

    #[test]
    fn merging_keeps_the_loudest_of_two_blocks() {
        let quiet = Meter { peak: 0.1, rms: 0.05 };
        let loud = Meter { peak: 0.9, rms: 0.4 };
        assert_eq!(quiet.merge(loud), loud);
        assert_eq!(loud.merge(quiet), loud);
    }

    #[test]
    fn full_scale_is_clipping() {
        assert!(Meter { peak: 1.0, rms: 0.7 }.is_clipping());
        assert!(!Meter { peak: 0.9, rms: 0.7 }.is_clipping());
    }

    #[test]
    fn silence_is_the_bottom_of_the_meter_rather_than_negative_infinity() {
        assert_eq!(to_db(0.0), MIN_DB);
        assert_eq!(meter_fraction(0.0), 0.0);
    }

    #[test]
    fn full_scale_fills_the_meter() {
        assert!((to_db(1.0)).abs() < 0.001);
        assert!((meter_fraction(1.0) - 1.0).abs() < 0.001);
    }

    #[test]
    fn half_amplitude_is_about_minus_six_db() {
        assert!((to_db(0.5) + 6.02).abs() < 0.01);
    }

    #[test]
    fn one_column_per_bucket_holding_the_loudest_sample() {
        let mut accumulator = PeakAccumulator::new(1, 4);
        accumulator.push(&[0.1, 0.9, -0.2, 0.3]);
        accumulator.push(&[0.4, 0.4, 0.4, -0.7]);
        assert_eq!(accumulator.peaks(), &[0.9, 0.7]);
        assert_eq!(accumulator.frames(), 8);
    }

    #[test]
    fn a_bucket_that_is_not_full_yet_produces_no_column() {
        let mut accumulator = PeakAccumulator::new(1, 4);
        accumulator.push(&[0.1, 0.9]);
        assert!(accumulator.peaks().is_empty());
        accumulator.push(&[0.2, 0.3]);
        assert_eq!(accumulator.peaks(), &[0.9]);
    }

    #[test]
    fn a_column_spans_every_channel_of_the_frame() {
        // A mic on the right input of an interface: channel one is silent, and
        // taking only channel one would draw a flat line.
        let mut accumulator = PeakAccumulator::new(2, 2);
        accumulator.push(&[0.0, 0.6, 0.0, 0.8]);
        assert_eq!(accumulator.peaks(), &[0.8]);
        assert_eq!(accumulator.frames(), 2);
    }

    #[test]
    fn peaks_from_returns_only_what_the_poller_has_not_seen() {
        let mut accumulator = PeakAccumulator::new(1, 2);
        accumulator.push(&[0.1, 0.2, 0.3, 0.4]);
        assert_eq!(accumulator.peaks_from(1), &[0.4]);
        assert_eq!(accumulator.peaks_from(2), &[] as &[f32]);
        // A stale cursor past the end must not panic.
        assert_eq!(accumulator.peaks_from(99), &[] as &[f32]);
    }

    #[test]
    fn frames_become_seconds_at_the_sample_rate() {
        let mut accumulator = PeakAccumulator::new(1, 512);
        accumulator.push(&vec![0.0; 48000]);
        assert!((accumulator.seconds(48000) - 1.0).abs() < 0.0001);
        assert_eq!(accumulator.seconds(0), 0.0);
    }

    #[test]
    fn the_queue_returns_what_was_pushed_in_order() {
        let mut queue = SampleQueue::new(8);
        assert_eq!(queue.push(&[1.0, 2.0, 3.0]), 3);
        let mut out = [0.0; 3];
        assert_eq!(queue.pop(&mut out), 3);
        assert_eq!(out, [1.0, 2.0, 3.0]);
        assert!(queue.is_empty());
    }

    #[test]
    fn the_queue_accepts_only_what_fits_and_says_so() {
        let mut queue = SampleQueue::new(4);
        assert_eq!(queue.push(&[1.0, 2.0, 3.0, 4.0, 5.0]), 4);
        assert_eq!(queue.free(), 0);
        assert_eq!(queue.push(&[6.0]), 0);
    }

    #[test]
    fn the_queue_wraps_instead_of_running_off_the_end() {
        let mut queue = SampleQueue::new(4);
        queue.push(&[1.0, 2.0, 3.0]);
        let mut out = [0.0; 2];
        queue.pop(&mut out);
        assert_eq!(queue.push(&[4.0, 5.0, 6.0]), 3);
        let mut rest = [0.0; 4];
        assert_eq!(queue.pop(&mut rest), 4);
        assert_eq!(rest, [3.0, 4.0, 5.0, 6.0]);
    }

    #[test]
    fn an_underrun_reports_how_much_was_real_audio() {
        let mut queue = SampleQueue::new(8);
        queue.push(&[1.0, 2.0]);
        let mut out = [9.0; 4];
        assert_eq!(queue.pop(&mut out), 2);
        assert_eq!(out[0], 1.0);
        assert_eq!(out[1], 2.0);
        // The tail is the caller's to zero; the queue does not touch it.
        assert_eq!(out[2], 9.0);
    }

    #[test]
    fn mono_into_stereo_is_heard_in_both_ears() {
        assert_eq!(map_channels(&[0.5, -0.5], 1, 2), vec![0.5, 0.5, -0.5, -0.5]);
    }

    #[test]
    fn stereo_into_mono_averages() {
        assert_eq!(map_channels(&[1.0, 0.0, 0.5, 0.5], 2, 1), vec![0.5, 0.5]);
    }

    #[test]
    fn a_matching_channel_count_is_passed_through() {
        assert_eq!(map_channels(&[1.0, 2.0], 2, 2), vec![1.0, 2.0]);
    }

    #[test]
    fn extra_device_channels_are_left_silent() {
        assert_eq!(map_channels(&[1.0, 2.0], 2, 3), vec![1.0, 2.0, 0.0]);
    }

    #[test]
    fn a_partial_trailing_frame_is_dropped_rather_than_mapped_from_garbage() {
        assert_eq!(map_channels(&[1.0, 2.0, 3.0], 2, 1), vec![1.5]);
    }

    #[test]
    fn a_sample_survives_the_trip_through_24_bit() {
        for original in [0.0f32, 0.5, -0.5, 0.123_456, -0.987] {
            let restored = fixed_to_f32(f32_to_fixed(original, TAKE_BITS), TAKE_BITS);
            assert!(
                (restored - original).abs() < 1e-6,
                "{original} came back as {restored}"
            );
        }
    }

    #[test]
    fn an_over_scale_sample_clamps_instead_of_wrapping() {
        let max = f32_to_fixed(1.0, TAKE_BITS);
        assert_eq!(f32_to_fixed(1.5, TAKE_BITS), max);
        assert_eq!(f32_to_fixed(-1.5, TAKE_BITS), -max);
        // Wrapping would put a full scale positive sample at the bottom of the
        // range, which is the loudest possible click.
        assert!(f32_to_fixed(1.5, TAKE_BITS) > 0);
    }

    #[test]
    fn a_broken_sample_is_written_as_silence() {
        assert_eq!(f32_to_fixed(f32::NAN, TAKE_BITS), 0);
        assert_eq!(f32_to_fixed(f32::INFINITY, TAKE_BITS), 0);
    }

    #[test]
    fn the_first_take_is_take_001() {
        assert_eq!(next_take_name(&[]), "take-001.wav");
    }

    #[test]
    fn numbering_continues_past_the_highest_take() {
        let existing = vec![
            "take-001.wav".to_string(),
            "take-007.wav".to_string(),
            "notes.txt".to_string(),
        ];
        assert_eq!(next_take_name(&existing), "take-008.wav");
    }

    #[test]
    fn a_deleted_take_does_not_reopen_its_number() {
        let existing = vec!["take-003.wav".to_string()];
        assert_eq!(next_take_name(&existing), "take-004.wav");
    }

    #[test]
    fn a_project_name_cannot_escape_its_folder() {
        assert_eq!(sanitize_project_name("../etc"), "etc");
        assert_eq!(sanitize_project_name("ep 12/part 2"), "ep 12-part 2");
    }

    #[test]
    fn an_empty_project_name_becomes_untitled() {
        assert_eq!(sanitize_project_name("   "), "untitled");
        assert_eq!(sanitize_project_name("..."), "untitled");
    }

    #[test]
    fn a_normal_project_name_is_left_alone() {
        assert_eq!(sanitize_project_name(" episode 12 "), "episode 12");
    }
}
