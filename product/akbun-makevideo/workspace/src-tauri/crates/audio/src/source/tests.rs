use super::*;
use makevideo_render::{
    Asset, AssetKind, Clip, ProjectSettings, Rate, Track, TrackKind, FORMAT_VERSION,
};
use std::sync::Condvar;

/// The fixtures the engine's tests build on too, so that a change to what
/// "one clip" means is a change in one place.
pub(crate) fn one_clip_project() -> Project {
    one_clip()
}

pub(crate) fn level_readers(level: f32) -> Arc<dyn Readers> {
    Arc::new(Fakes {
        levels: vec![("/m/a1".into(), level)],
        ..Fakes::default()
    })
}

/// A reader that hands back a constant level, so a test can assert which
/// clip is in the mix and at what volume rather than only that something
/// is.
struct Level {
    level: f32,
    left: i64,
    delay: Duration,
}

impl PcmReader for Level {
    fn read(&mut self, buffer: &mut [f32]) -> usize {
        if self.left <= 0 {
            return 0;
        }
        if !self.delay.is_zero() {
            std::thread::sleep(self.delay);
        }
        let samples = buffer.len().min(self.left as usize);
        buffer[..samples].fill(self.level);
        self.left -= samples as i64;
        samples
    }
}

#[derive(Default)]
struct Fakes {
    opened: Mutex<Vec<Open>>,
    /// Path to the level it plays. Anything not listed plays 1.0.
    levels: Vec<(String, f32)>,
    missing: Vec<String>,
    slow: Vec<(String, Duration)>,
    /// Path to how many sample frames it really has.
    short: Vec<(String, i64)>,
    /// Play a level that says where in the source the reader was opened,
    /// so a test can assert *which* part of the file arrived rather than
    /// only that something did. One second in plays 2.0, two seconds in
    /// plays 3.0.
    mark_in_point: bool,
}

impl Fakes {
    fn opens(&self) -> Vec<Open> {
        self.opened.lock().unwrap().clone()
    }
}

impl Readers for Fakes {
    fn open(&self, request: &Open) -> Option<Box<dyn PcmReader>> {
        self.opened.lock().unwrap().push(request.clone());
        if self.missing.iter().any(|path| *path == request.path) {
            return None;
        }
        let find = |list: &Vec<(String, Duration)>| {
            list.iter()
                .find(|(path, _)| *path == request.path)
                .map(|(_, value)| *value)
        };
        let level = if self.mark_in_point {
            1.0 + request.in_time.to_seconds() as f32
        } else {
            self.levels
                .iter()
                .find(|(path, _)| *path == request.path)
                .map(|(_, level)| *level)
                .unwrap_or(1.0)
        };
        let frames = self
            .short
            .iter()
            .find(|(path, _)| *path == request.path)
            .map(|(_, frames)| *frames)
            .unwrap_or(request.frames)
            .min(request.frames);
        Some(Box::new(Level {
            level,
            left: frames * (CHANNELS as i64),
            delay: find(&self.slow).unwrap_or_default(),
        }))
    }
}

struct Blocking {
    stopped: Arc<(Mutex<bool>, Condvar)>,
    reading: Arc<AtomicBool>,
}

impl PcmReader for Blocking {
    fn read(&mut self, _buffer: &mut [f32]) -> usize {
        self.reading.store(true, Ordering::SeqCst);
        let (lock, wake) = &*self.stopped;
        let mut stopped = lock.lock().unwrap();
        while !*stopped {
            stopped = wake.wait(stopped).unwrap();
        }
        0
    }

    fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
        Some(Arc::new(Unblock(Arc::clone(&self.stopped))))
    }
}

struct Unblock(Arc<(Mutex<bool>, Condvar)>);

impl CancelRead for Unblock {
    fn cancel(&self) {
        let (lock, wake) = &*self.0;
        *lock.lock().unwrap() = true;
        wake.notify_all();
    }
}

struct BlockingReaders {
    stopped: Arc<(Mutex<bool>, Condvar)>,
    reading: Arc<AtomicBool>,
}

impl Readers for BlockingReaders {
    fn open(&self, _request: &Open) -> Option<Box<dyn PcmReader>> {
        Some(Box::new(Blocking {
            stopped: Arc::clone(&self.stopped),
            reading: Arc::clone(&self.reading),
        }))
    }
}

fn asset(id: &str) -> Asset {
    Asset {
        id: id.into(),
        path: format!("/m/{id}"),
        name: id.into(),
        kind: AssetKind::Audio,
        duration_ms: 600_000,
        width: 0,
        height: 0,
        has_audio: true,
    }
}

fn clip(id: &str, asset_id: &str, start: i64, in_point: i64, out_point: i64) -> Clip {
    Clip {
        id: id.into(),
        asset_id: asset_id.into(),
        link_group: None,
        lut_path: None,
        start,
        in_point,
        out_point,
        volume: 1.0,
        opacity: 1.0,
        speed: 1.0,
        preserve_pitch: true,
        denoise: 0.0,
        fade_in: 0,
        fade_out: 0,
        volume_keyframes: Default::default(),
        blend_mode: Default::default(),
    }
}

fn track(id: &str, clips: Vec<Clip>) -> Track {
    Track {
        id: id.into(),
        kind: TrackKind::Audio,
        name: id.into(),
        clips,
        visual_items: Vec::new(),
        muted: false,
        hidden: false,
        subtitle_style: None,
    }
}

fn project(tracks: Vec<Track>, assets: Vec<Asset>) -> Project {
    Project {
        version: FORMAT_VERSION,
        settings: ProjectSettings {
            width: 1920,
            height: 1080,
            rate: Rate::fps(30),
        },
        assets,
        tracks,
        transitions: Vec::new(),
        markers: Vec::new(),
    }
}

/// One clip, one second long: 30 frames of 30 fps, 48000 samples.
fn one_clip() -> Project {
    project(
        vec![track("A1", vec![clip("c1", "a1", 0, 0, 30)])],
        vec![asset("a1")],
    )
}

fn source(project: &Project, buffering: Buffering, readers: Arc<Fakes>) -> MixSource {
    MixSource::new(project, buffering, readers)
}

fn block(frames: usize) -> Vec<f32> {
    vec![0.0; frames * CHANNELS]
}

fn next(source: &mut MixSource, out: &mut [f32]) -> Supply {
    source.take_by(out, Instant::now() + Duration::from_secs(5))
}

fn wait_for(mut ready: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if ready() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    false
}

#[test]
fn a_clip_plays_at_its_own_level_for_exactly_its_own_span() {
    let project = one_clip();
    let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
    let mut out = block(BLOCK_FRAMES);
    let mut mixed = 0i64;
    while let Supply::Ready = next(&mut source, &mut out) {
        let frames = (source.position() - mixed) as usize;
        assert!(
            out[..frames * CHANNELS]
                .iter()
                .all(|sample| (*sample - 1.0).abs() < 1e-6),
            "silence inside the clip at sample {mixed}"
        );
        mixed = source.position();
    }
    assert_eq!(mixed, 48_000, "one second at the engine rate");
    assert_eq!(source.take(&mut out), Supply::End);
}

#[test]
fn a_gap_in_the_timeline_is_silence_rather_than_a_stall() {
    // Half a second of nothing, then the clip. The mix has to run through
    // the gap at full speed: waiting for a clip that has not started is how
    // a timeline with a title card at the front never plays at all.
    let project = project(
        vec![track("A1", vec![clip("c1", "a1", 15, 0, 30)])],
        vec![asset("a1")],
    );
    let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
    let mut out = block(BLOCK_FRAMES);
    assert_eq!(next(&mut source, &mut out), Supply::Ready);
    assert!(out.iter().all(|sample| *sample == 0.0), "the gap is silent");
}

#[test]
fn two_clips_at_the_same_instant_are_summed() {
    // amix=normalize=0 again, this time through the whole source rather
    // than through add_into alone.
    let project = project(
        vec![
            track("A1", vec![clip("c1", "a1", 0, 0, 30)]),
            track("A2", vec![clip("c2", "a2", 0, 0, 30)]),
        ],
        vec![asset("a1"), asset("a2")],
    );
    let readers = Arc::new(Fakes {
        levels: vec![("/m/a1".into(), 0.25), ("/m/a2".into(), 0.5)],
        ..Fakes::default()
    });
    let mut source = source(&project, Buffering::default(), readers);
    let mut out = block(64);
    assert_eq!(next(&mut source, &mut out), Supply::Ready);
    assert!(
        out.iter().all(|sample| (*sample - 0.75).abs() < 1e-6),
        "{:?}",
        &out[..4]
    );
}

#[test]
fn a_clips_volume_scales_it() {
    let mut project = one_clip();
    project.tracks[0].clips[0].volume = 0.5;
    let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
    let mut out = block(64);
    assert_eq!(next(&mut source, &mut out), Supply::Ready);
    assert!(out.iter().all(|sample| (*sample - 0.5).abs() < 1e-6));
}

#[test]
fn nothing_is_consumed_when_one_clip_is_not_ready() {
    // The audio version of the frame source's torn frame. Consuming the
    // ready clips would put clip A a block ahead of clip B for the rest of
    // the timeline, which is a mix that slides apart rather than one that
    // stutters once.
    let project = project(
        vec![
            track("A1", vec![clip("c1", "a1", 0, 0, 30)]),
            track("A2", vec![clip("c2", "a2", 0, 0, 30)]),
        ],
        vec![asset("a1"), asset("a2")],
    );
    let readers = Arc::new(Fakes {
        slow: vec![("/m/a2".into(), Duration::from_millis(40))],
        ..Fakes::default()
    });
    let mut source = source(&project, Buffering::new(2, 0), readers);
    let mut out = block(BLOCK_FRAMES);

    let mut starved = 0;
    loop {
        match source.take(&mut out) {
            Supply::Starved => {
                starved += 1;
                assert_eq!(source.position(), 0, "the playhead did not move");
                std::thread::sleep(Duration::from_millis(2));
            }
            Supply::Ready => {
                assert!(
                    out.iter().all(|sample| (*sample - 2.0).abs() < 1e-6),
                    "both clips, same instant"
                );
                break;
            }
            Supply::End => panic!("the timeline is a second long"),
        }
    }
    assert!(starved > 0, "the slow clip should have starved a poll");
}

#[test]
fn a_decoder_starts_before_its_clip_does() {
    let project = project(
        vec![track("A1", vec![clip("c1", "a1", 30, 0, 30)])],
        vec![asset("a1")],
    );
    let readers = Arc::new(Fakes::default());
    // Lead of a quarter second against a clip a second in.
    let mut source = source(&project, Buffering::new(4, 12_000), Arc::clone(&readers));
    assert!(source.decoding().is_empty(), "nothing is due yet");
    let mut out = block(BLOCK_FRAMES);
    // Forty blocks is 40960 samples, still short of the clip at 48000, and
    // past the point where the lead reaches it.
    for _ in 0..40 {
        assert_eq!(next(&mut source, &mut out), Supply::Ready);
        assert!(
            out.iter().all(|sample| *sample == 0.0),
            "the clip is silent"
        );
    }
    assert!(source.position() < 48_000, "the clip has not started");
    assert_eq!(source.decoding(), vec!["c1"], "but its decoder has");
    assert!(
        wait_for(|| source.buffered_samples() > 0),
        "the queue should be filling before the clip is heard"
    );
}

#[test]
fn a_decoder_reads_from_the_clip_in_point_not_the_timeline() {
    let project = project(
        vec![track("A1", vec![clip("c1", "a1", 30, 45, 75)])],
        vec![asset("a1")],
    );
    let readers = Arc::new(Fakes::default());
    // A lead of a whole second, so the decoder is started by the first poll
    // rather than a second of blocks later. What is under test here is what
    // it is asked for, not when.
    let mut source = source(&project, Buffering::new(8, 48_000), Arc::clone(&readers));
    let mut out = block(BLOCK_FRAMES);
    next(&mut source, &mut out);
    assert!(
        wait_for(|| !readers.opens().is_empty()),
        "no decoder started"
    );
    let open = readers.opens()[0].clone();
    // Frame 45 of 30 fps is a second and a half in.
    assert_eq!(open.in_time.seconds_text(6), "1.500000");
    assert_eq!(open.frames, 48_000, "the clip's own length in samples");
}

#[test]
fn seeking_into_a_clip_reads_from_the_matching_point_of_the_source() {
    // The seek arithmetic that is easy to get wrong: a mid-clip start has
    // to move the source in point by the same distance, or every clip
    // after a seek plays from its beginning.
    let project = project(
        vec![track("A1", vec![clip("c1", "a1", 0, 30, 90)])],
        vec![asset("a1")],
    );
    let readers = Arc::new(Fakes::default());
    let mut source = source(&project, Buffering::default(), Arc::clone(&readers));
    source.seek(48_000);
    let mut out = block(64);
    next(&mut source, &mut out);
    assert!(wait_for(|| !readers.opens().is_empty()));
    let open = readers.opens().last().unwrap().clone();
    // A second into a clip that starts a second into its source.
    assert_eq!(open.in_time.seconds_text(6), "2.000000");
    assert_eq!(open.frames, 48_000, "what is left of the clip");
}

#[test]
fn seeking_plays_the_new_position_and_not_what_was_mixed_for_the_old_one() {
    // The level says where in the source it came from, so this asserts the
    // samples rather than the bookkeeping. Checking that the queues are
    // empty right after a seek would not: a seek starts the next decoder
    // immediately, so by the time anything can look, the queue is filling
    // again with the frames that are wanted.
    let project = one_clip();
    let readers = Arc::new(Fakes {
        mark_in_point: true,
        ..Fakes::default()
    });
    let mut source = source(&project, Buffering::default(), Arc::clone(&readers));
    let mut out = block(BLOCK_FRAMES);
    next(&mut source, &mut out);
    assert!(
        out.iter().all(|sample| (*sample - 1.0).abs() < 1e-6),
        "playback started at the top of the clip"
    );
    assert!(wait_for(|| source.buffered_samples() > 0));

    source.seek(24_000);
    assert_eq!(source.position(), 24_000);
    assert_eq!(next(&mut source, &mut out), Supply::Ready);
    assert!(
        out.iter().all(|sample| (*sample - 1.5).abs() < 1e-6),
        "half a second into the source, not the samples buffered before the seek"
    );
    assert_eq!(readers.opens().len(), 2, "a seek is a new decoder");
    assert_eq!(readers.opens()[1].in_time.seconds_text(6), "0.500000");
}

#[test]
fn a_clip_that_begins_inside_a_block_is_decoded_even_with_no_lead() {
    // A stall that never clears. `take` mixes a block at a time, so a clip
    // whose first sample falls part way through a block is asked for during
    // that block whatever the lead is. If the decoder is started from the
    // lead alone there is nothing to ask, `take` answers Starved without
    // moving the playhead, and the next call finds the identical state and
    // refuses again — forever.
    //
    // The frame source next door cannot reach this because it steps one
    // frame at a time. This one is a block at a time, and that is what made
    // porting its condition wrong here.
    let project = project(
        // Frame 1 of 30 fps is sample 1600, which is inside the second
        // block rather than on a block boundary.
        vec![track("A1", vec![clip("c1", "a1", 1, 0, 30)])],
        vec![asset("a1")],
    );
    let mut source = source(&project, Buffering::new(4, 0), Arc::new(Fakes::default()));
    let mut out = block(BLOCK_FRAMES);
    let mut blocks = 0;
    while let Supply::Ready = next(&mut source, &mut out) {
        blocks += 1;
        assert!(
            blocks < 200,
            "wedged at sample {} of {}",
            source.position(),
            source.total_samples()
        );
    }
    assert_eq!(source.position(), source.total_samples());
    assert_eq!(source.total_samples(), 31 * 1600);
}

#[test]
fn a_seek_between_frames_asks_the_source_for_the_exact_sample() {
    // Engine::seek_sample takes an engine sample, not a frame, so a target
    // between two frames is reachable. Rounding it to the nearest project
    // frame on the way to ffmpeg would put the clip up to half a frame from
    // where `next` and the mix place it — 16.7 ms at 30 fps — and nothing
    // downstream corrects it.
    let project = project(
        vec![track("A1", vec![clip("c1", "a1", 0, 30, 90)])],
        vec![asset("a1")],
    );
    let readers = Arc::new(Fakes::default());
    let mut source = source(&project, Buffering::default(), Arc::clone(&readers));
    source.seek(24_800);
    let mut out = block(64);
    next(&mut source, &mut out);
    assert!(wait_for(|| !readers.opens().is_empty()));

    let open = readers.opens().last().unwrap().clone();
    // A second into the source (in point frame 30) plus 24800 samples.
    assert_eq!(open.in_time.seconds_text(6), "1.516667");
    assert_eq!(open.frames, 96_000 - 24_800, "what is left of the clip");
}

#[test]
fn seeking_past_the_end_lands_on_the_end() {
    let project = one_clip();
    let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
    source.seek(9_000_000);
    assert_eq!(source.position(), 48_000);
    let mut out = block(64);
    assert_eq!(source.take(&mut out), Supply::End);
    source.seek(-5);
    assert_eq!(source.position(), 0);
}

#[test]
fn a_source_that_cannot_be_opened_only_silences_its_own_clip() {
    let project = project(
        vec![
            track("A1", vec![clip("c1", "a1", 0, 0, 30)]),
            track("A2", vec![clip("c2", "gone", 0, 0, 30)]),
        ],
        vec![asset("a1"), asset("gone")],
    );
    let readers = Arc::new(Fakes {
        missing: vec!["/m/gone".into()],
        ..Fakes::default()
    });
    let mut source = source(&project, Buffering::default(), readers);
    let mut out = block(BLOCK_FRAMES);
    let mut mixed = 0;
    while let Supply::Ready = next(&mut source, &mut out) {
        let frames = (source.position() - mixed) as usize;
        assert!(
            out[..frames * CHANNELS]
                .iter()
                .all(|sample| (*sample - 1.0).abs() < 1e-6),
            "the clip that is there still plays"
        );
        mixed = source.position();
    }
    assert_eq!(mixed, 48_000);
}

#[test]
fn a_source_that_ends_early_goes_silent_and_the_timeline_runs_on() {
    let project = one_clip();
    let readers = Arc::new(Fakes {
        short: vec![("/m/a1".into(), 12_000)],
        ..Fakes::default()
    });
    let mut source = source(&project, Buffering::default(), readers);
    let mut out = block(BLOCK_FRAMES);
    let mut mixed = 0i64;
    let mut sounding = 0i64;
    while let Supply::Ready = next(&mut source, &mut out) {
        let frames = (source.position() - mixed) as usize;
        sounding += out[..frames * CHANNELS]
            .iter()
            .step_by(CHANNELS)
            .filter(|sample| **sample != 0.0)
            .count() as i64;
        mixed = source.position();
    }
    assert_eq!(mixed, 48_000, "the timeline still ran to its end");
    assert_eq!(sounding, 12_000, "a hole, not a stall");
}

#[test]
fn a_source_longer_than_its_clip_is_cut_off_at_the_clip() {
    // ffmpeg's -t is a time and the clip is a sample count, so the two can
    // differ by a sample. The clip wins, or every clip after this one
    // starts late by however much the source overran.
    let project = project(
        vec![
            track("A1", vec![clip("c1", "a1", 0, 0, 15)]),
            track("A2", vec![clip("c2", "a2", 15, 0, 15)]),
        ],
        vec![asset("a1"), asset("a2")],
    );
    let readers = Arc::new(Fakes {
        levels: vec![("/m/a1".into(), 1.0), ("/m/a2".into(), 2.0)],
        short: vec![("/m/a1".into(), 999_999)],
        ..Fakes::default()
    });
    let mut source = source(&project, Buffering::default(), readers);
    let mut out = block(BLOCK_FRAMES);
    let mut mixed = 0i64;
    while let Supply::Ready = next(&mut source, &mut out) {
        let frames = (source.position() - mixed) as usize;
        for (index, sample) in out[..frames * CHANNELS]
            .iter()
            .step_by(CHANNELS)
            .enumerate()
        {
            let at = mixed + index as i64;
            let expected = if at < 24_000 { 1.0 } else { 2.0 };
            assert!(
                (*sample - expected).abs() < 1e-6,
                "sample {at} was {sample}, wanted {expected}"
            );
        }
        mixed = source.position();
    }
    assert_eq!(mixed, 48_000);
}

#[test]
fn the_queue_never_grows_past_its_depth() {
    let project = one_clip();
    let mut source = source(&project, Buffering::new(3, 0), Arc::new(Fakes::default()));
    let mut out = block(64);
    next(&mut source, &mut out);
    std::thread::sleep(Duration::from_millis(50));
    assert!(
        source.buffered_bytes() <= source.buffer_ceiling(),
        "buffered {} against a ceiling of {}",
        source.buffered_bytes(),
        source.buffer_ceiling()
    );
}

#[test]
fn the_ceiling_counts_the_clips_that_can_buffer_at_once_not_all_of_them() {
    let one_clip_full = (3 + 2) * BLOCK_FRAMES * CHANNELS * 4;
    let sequence = project(
        vec![track(
            "A1",
            vec![
                clip("c1", "a1", 0, 0, 30),
                clip("c2", "a1", 30, 0, 30),
                clip("c3", "a1", 60, 0, 30),
            ],
        )],
        vec![asset("a1")],
    );
    let sequential = source(&sequence, Buffering::new(3, 0), Arc::new(Fakes::default()));
    assert_eq!(sequential.buffer_ceiling(), one_clip_full);

    let stacked = project(
        vec![
            track("A1", vec![clip("c1", "a1", 0, 0, 30)]),
            track("A2", vec![clip("c2", "a2", 0, 0, 30)]),
        ],
        vec![asset("a1"), asset("a2")],
    );
    let overlapping = source(&stacked, Buffering::new(3, 0), Arc::new(Fakes::default()));
    assert_eq!(overlapping.buffer_ceiling(), 2 * one_clip_full);
    // A lead makes the next clip's queue overlap the one before it.
    let led = source(
        &sequence,
        Buffering::new(3, 4_800),
        Arc::new(Fakes::default()),
    );
    assert_eq!(led.buffer_ceiling(), 2 * one_clip_full, "the lead overlaps");
}

#[test]
fn a_decoder_is_stopped_when_its_clip_is_over() {
    let project = project(
        vec![track("A1", vec![clip("c1", "a1", 0, 0, 15)])],
        vec![asset("a1")],
    );
    let mut source = source(&project, Buffering::new(2, 0), Arc::new(Fakes::default()));
    let mut out = block(BLOCK_FRAMES);
    while let Supply::Ready = next(&mut source, &mut out) {}
    assert!(source.decoding().is_empty(), "the decoder was retired");
}

#[test]
fn dropping_interrupts_a_reader_blocked_mid_block() {
    let stopped = Arc::new((Mutex::new(false), Condvar::new()));
    let reading = Arc::new(AtomicBool::new(false));
    let readers = Arc::new(BlockingReaders {
        stopped,
        reading: Arc::clone(&reading),
    });
    let project = one_clip();
    let mut source = MixSource::new(&project, Buffering::default(), readers);
    let mut out = block(BLOCK_FRAMES);
    assert_eq!(source.take(&mut out), Supply::Starved);
    assert!(wait_for(|| reading.load(Ordering::SeqCst)));

    let (done, finished) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        drop(source);
        let _ = done.send(());
    });
    assert!(finished.recv_timeout(Duration::from_secs(1)).is_ok());
}

#[test]
fn a_block_shorter_than_what_is_left_stops_at_the_end_of_the_timeline() {
    // The last block of a project is almost never a whole one, and mixing
    // past the end would put a fraction of a block of the clip's tail
    // after the timeline finished.
    let project = one_clip();
    let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
    source.seek(48_000 - 10);
    let mut out = vec![-1.0; BLOCK_FRAMES * CHANNELS];
    assert_eq!(next(&mut source, &mut out), Supply::Ready);
    assert_eq!(source.position(), 48_000);
    assert!(out[..10 * CHANNELS]
        .iter()
        .all(|sample| (*sample - 1.0).abs() < 1e-6));
    assert!(
        out[10 * CHANNELS..].iter().all(|sample| *sample == -1.0),
        "past the end is left untouched for the caller to deal with"
    );
    assert_eq!(source.take(&mut out), Supply::End);
}

#[test]
fn a_project_with_no_sound_at_all_still_runs_to_its_end() {
    // A silent film. The timeline is a second long because the picture says
    // so, and the mix has to run all of it: an engine that stops where the
    // sound stops would stop the picture with it.
    let mut project = one_clip();
    project.tracks[0].muted = true;
    project.tracks.push(Track {
        id: "V1".into(),
        kind: TrackKind::Video,
        name: "V1".into(),
        clips: vec![clip("v1", "silent", 0, 0, 30)],
        visual_items: Vec::new(),
        muted: false,
        hidden: false,
        subtitle_style: None,
    });
    project.assets.push(Asset {
        kind: AssetKind::Video,
        has_audio: false,
        ..asset("silent")
    });

    let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
    assert!(source.decoding().is_empty(), "there is nothing to decode");
    let mut out = block(BLOCK_FRAMES);
    let mut blocks = 0;
    while let Supply::Ready = next(&mut source, &mut out) {
        assert!(out.iter().all(|sample| *sample == 0.0));
        blocks += 1;
        assert!(blocks < 1_000, "it should have reached the end by now");
    }
    assert_eq!(source.position(), 48_000);
}
