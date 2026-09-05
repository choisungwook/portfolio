//! Samples arriving ahead of the playhead: one decoder per audible clip on its
//! own thread, each filling a bounded queue, and one mixer taking from all of
//! them.
//!
//! This is the frame source next door with the sizes changed, and deliberately
//! so: the same shape means the same behaviour on a seek, on a broken file and
//! on a clip that ends early, and one behaviour is one thing to get right.
//!
//! What is different is what a shortfall costs. A late video frame is a frame
//! held a moment too long, which most people do not see. A late sample is a
//! hole in the sound, which everybody hears. So the buffers here are long in
//! time and tiny in memory — a second of stereo is 384 KB against 8.3 MB for a
//! single 1080p frame — and being generous with them is close to free.
//!
//! Nothing here runs on the audio callback's thread. The mixing, the reading
//! and the waiting all happen on the feeder thread, ahead of the sound. See
//! [`crate::realtime`] for the rule that makes that mandatory.

use crate::mix::{add_into_region, regions, total_samples, Region};
use crate::realtime::{CHANNELS, ENGINE_HZ};
use makevideo_render::{ffmpeg, Project, RationalTime};
use std::io::Read;
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// Sample frames the mixer works in at a time. 1024 at 48 kHz is 21 ms, which
/// is short enough that a seek does not have to wait for a long block to finish
/// and long enough that the per-block bookkeeping is nothing.
pub const BLOCK_FRAMES: usize = 1_024;

/// Blocks a clip may hold decoded ahead of the playhead.
///
/// Eight blocks is 170 ms and 64 KB per clip. That is the ratio the whole
/// module trades on: the video source buys 200 ms of slack for 50 MB a clip,
/// and here the same slack costs less than a rounding error, so there is no
/// reason to be careful with it.
pub const DEFAULT_DEPTH: usize = 8;

/// How far ahead of a clip its decoder is started, in engine samples.
///
/// Half a second. Starting an ffmpeg process and seeking a file is tens of
/// milliseconds, and paying that on the sample the clip begins is a hole
/// exactly as long.
pub const DEFAULT_LEAD: i64 = ENGINE_HZ as i64 / 2;

/// How long `take_by` sleeps between attempts while it waits.
const POLL: Duration = Duration::from_micros(500);

/// Raw samples for one clip: interleaved stereo f32 at [`ENGINE_HZ`].
///
/// The ffmpeg process is the only implementation the app uses. The trait exists
/// because the buffering and the mixing are the parts that can be wrong, and
/// they can be tested exactly against a reader that hands back a known tone.
pub trait PcmReader: Send {
    /// Fill as much of `buffer` as there is left and say how many samples that
    /// was. Zero means the source is over, whether it ran out or broke.
    fn read(&mut self, buffer: &mut [f32]) -> usize;

    /// A handle that can interrupt a blocking `read`. The ffmpeg reader uses it
    /// to kill its process on a seek or a drop.
    fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
        None
    }
}

/// Stops a reader without needing the thread that is currently inside it.
pub trait CancelRead: Send + Sync {
    fn cancel(&self);
}

/// What one clip's decoder is asked for. Owned, because the open happens on the
/// decoder's own thread.
#[derive(Debug, Clone, PartialEq)]
pub struct Open {
    pub path: String,
    pub in_time: RationalTime,
    pub duration: RationalTime,
    /// Sample frames wanted, which bounds what the mixer will take however many
    /// ffmpeg decides to hand over.
    pub frames: i64,
    pub speed: f32,
    pub preserve_pitch: bool,
}

/// Opens the readers.
pub trait Readers: Send + Sync {
    /// `None` means this clip cannot be decoded. It goes silent, which is the
    /// same hole its picture leaves.
    fn open(&self, request: &Open) -> Option<Box<dyn PcmReader>>;
}

/// The real one: an ffmpeg process per clip, decoding to raw f32.
pub struct FfmpegReaders {
    pub ffmpeg: String,
}

impl FfmpegReaders {
    pub fn new(ffmpeg: &str) -> FfmpegReaders {
        FfmpegReaders {
            ffmpeg: ffmpeg.to_string(),
        }
    }
}

impl Readers for FfmpegReaders {
    fn open(&self, request: &Open) -> Option<Box<dyn PcmReader>> {
        let args = ffmpeg::audio_decoder_args(&ffmpeg::DecodeAudio {
            path: &request.path,
            in_time: request.in_time,
            duration: request.duration,
            speed: request.speed,
            preserve_pitch: request.preserve_pitch,
        });
        let mut child = Command::new(&self.ffmpeg)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            // A decoder that cannot open its file goes silent rather than
            // reporting, so there is nothing to read from stderr.
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let stdout = child.stdout.take()?;
        Some(Box::new(FfmpegPcm {
            child: Arc::new(Mutex::new(child)),
            stdout,
            bytes: vec![0u8; BLOCK_FRAMES * CHANNELS * 4],
        }))
    }
}

struct FfmpegPcm {
    child: Arc<Mutex<Child>>,
    stdout: ChildStdout,
    /// Read once and reused. Allocating a buffer per block would be harmless on
    /// this thread and pointless everywhere.
    bytes: Vec<u8>,
}

struct FfmpegCancel {
    child: Arc<Mutex<Child>>,
}

impl CancelRead for FfmpegCancel {
    fn cancel(&self) {
        let _ = self.child.lock().unwrap().kill();
    }
}

impl PcmReader for FfmpegPcm {
    fn read(&mut self, buffer: &mut [f32]) -> usize {
        let wanted = buffer.len().min(self.bytes.len() / 4) * 4;
        // A short read at the end of a file is normal and is not a failure, so
        // what is taken is whatever arrived, rounded down to whole frames.
        let mut filled = 0usize;
        while filled < wanted {
            match self.stdout.read(&mut self.bytes[filled..wanted]) {
                Ok(0) => break,
                Ok(count) => filled += count,
                Err(_) => break,
            }
        }
        let samples = filled / 4;
        let frames = samples / CHANNELS;
        for index in 0..frames * CHANNELS {
            let start = index * 4;
            buffer[index] = f32::from_le_bytes([
                self.bytes[start],
                self.bytes[start + 1],
                self.bytes[start + 2],
                self.bytes[start + 3],
            ]);
        }
        frames * CHANNELS
    }

    fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
        Some(Arc::new(FfmpegCancel {
            child: Arc::clone(&self.child),
        }))
    }
}

impl Drop for FfmpegPcm {
    fn drop(&mut self) {
        let mut child = self.child.lock().unwrap();
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// How much is decoded ahead, and how early.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Buffering {
    /// Blocks of [`BLOCK_FRAMES`] a clip may hold ahead of the playhead.
    pub depth: usize,
    /// Engine samples of head start for a decoder.
    pub lead: i64,
}

impl Buffering {
    pub fn new(depth: usize, lead: i64) -> Buffering {
        Buffering {
            depth: depth.max(1),
            lead: lead.max(0),
        }
    }
}

impl Default for Buffering {
    fn default() -> Self {
        Buffering::new(DEFAULT_DEPTH, DEFAULT_LEAD)
    }
}

/// What a poll found. The same three answers the frame source gives, for the
/// same reasons.
#[derive(Debug, PartialEq, Eq)]
pub enum Supply {
    /// The block was filled. Clips that had nothing to give contributed
    /// silence, which is not a failure: a hole in one clip is a hole in the
    /// timeline, not a reason to stop.
    Ready,
    /// A clip that should be sounding had nothing buffered yet. **Nothing was
    /// consumed** and the playhead did not move, so a retry gets the same
    /// samples rather than a torn block.
    Starved,
    /// Past the end of the timeline.
    End,
}

/// One clip and the thread filling its queue.
struct Stream {
    region: Region,
    receiver: Option<Receiver<Vec<f32>>>,
    /// Decoded and not yet mixed. A block from the queue rarely lines up with a
    /// block of the mix, so what is left over waits here.
    pending: Vec<f32>,
    /// How far into `pending` the mixer has got.
    consumed: usize,
    /// The next **timeline** sample this clip contributes.
    ///
    /// One number rather than a start plus an offset, because the two of them
    /// have to be added together in four places and getting one of those wrong
    /// is a clip that plays in the wrong part of the timeline. It begins at the
    /// clip's own start and only ever moves forward, so "this clip has not
    /// begun yet" and "this clip is finished" are both just comparisons.
    next: i64,
    /// Samples sitting in the channel, so what is buffered can be reported
    /// without draining it.
    queued: Arc<AtomicUsize>,
    decoder: Option<JoinHandle<()>>,
    cancellation: Arc<DecoderCancellation>,
    /// The source could not be opened or has run out. The clip goes silent.
    dead: bool,
}

#[derive(Default)]
struct DecoderCancellation {
    cancelled: AtomicBool,
    reader: Mutex<Option<Arc<dyn CancelRead>>>,
}

impl DecoderCancellation {
    fn attach(&self, reader: Option<Arc<dyn CancelRead>>) -> bool {
        *self.reader.lock().unwrap() = reader;
        if !self.cancelled.load(Ordering::SeqCst) {
            return false;
        }
        self.cancel();
        true
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(reader) = self.reader.lock().unwrap().as_ref() {
            reader.cancel();
        }
    }
}

impl Stream {
    /// Samples of this clip decoded and not yet mixed.
    fn ready(&self) -> usize {
        self.pending.len() - self.consumed
    }

    /// Samples decoded anywhere: in the pending buffer or still in the queue.
    fn buffered(&self) -> usize {
        self.ready() + self.queued.load(Ordering::SeqCst)
    }
}

/// The timeline as one stream of mixed, engine rate stereo blocks.
///
/// Not connected to a device. It is driven by the engine's feeder thread and by
/// the soak meter, both of which are headless, for the same reason the frame
/// source is: a mix that is wrong and a mix that arrives late sound alike and
/// have nothing to do with each other.
pub struct MixSource {
    readers: Arc<dyn Readers>,
    streams: Vec<Stream>,
    retiring: Vec<JoinHandle<()>>,
    buffering: Buffering,
    total: i64,
    position: i64,
}

impl MixSource {
    pub fn new(project: &Project, buffering: Buffering, readers: Arc<dyn Readers>) -> MixSource {
        let streams = regions(project)
            .into_iter()
            .map(|region| Stream {
                next: region.start_sample,
                region,
                receiver: None,
                pending: Vec::new(),
                consumed: 0,
                queued: Arc::new(AtomicUsize::new(0)),
                decoder: None,
                cancellation: Arc::new(DecoderCancellation::default()),
                dead: false,
            })
            .collect();
        MixSource {
            readers,
            streams,
            retiring: Vec::new(),
            buffering,
            total: total_samples(project),
            position: 0,
        }
    }

    /// How long the whole mix is, in engine samples.
    pub fn total_samples(&self) -> i64 {
        self.total
    }

    /// The sample the next `take` will start at.
    pub fn position(&self) -> i64 {
        self.position
    }

    /// Samples sitting decoded across every clip, in the queues as well as in
    /// the pending buffers.
    pub fn buffered_samples(&self) -> usize {
        self.streams.iter().map(|stream| stream.buffered()).sum()
    }

    pub fn buffered_bytes(&self) -> usize {
        self.buffered_samples() * 4
    }

    /// The most the queues can hold at one instant: every clip that can be
    /// buffering at the same time, full. Summing every clip in the project
    /// instead would be a bound nothing could reach, and a bound like that
    /// catches no leak.
    pub fn buffer_ceiling(&self) -> usize {
        let mut events: Vec<(i64, u8)> = Vec::new();
        for stream in &self.streams {
            let from = stream.region.start_sample - self.buffering.lead;
            let until = stream.region.end_sample;
            if until <= from {
                continue;
            }
            events.push((from, 1));
            events.push((until, 0));
        }
        events.sort();

        let (mut live, mut worst) = (0usize, 0usize);
        for (_, starting) in events {
            if starting == 1 {
                live += 1;
                worst = worst.max(live);
            } else {
                live -= 1;
            }
        }
        // Per clip: `depth` blocks in the queue, plus two in the pending
        // buffer. Two and not one because `fill` stops as soon as it has
        // enough, which means it can be holding almost a whole block it did not
        // need on top of the one it has just pulled.
        worst * (self.buffering.depth + 2) * BLOCK_FRAMES * CHANNELS * 4
    }

    /// The clips with a decoder running.
    pub fn decoding(&self) -> Vec<&str> {
        self.streams
            .iter()
            .filter(|stream| stream.decoder.is_some())
            .map(|stream| stream.region.clip_id.as_str())
            .collect()
    }

    /// Move the playhead to an engine sample. Every queue is thrown away and
    /// refilled from the target, exactly as the frame source does it.
    pub fn seek(&mut self, sample: i64) {
        for index in 0..self.streams.len() {
            self.retire(index);
            self.streams[index].dead = false;
        }
        self.position = sample.clamp(0, self.total);
        for stream in self.streams.iter_mut() {
            // A clip the playhead has landed inside starts from the playhead;
            // one it has not reached yet still starts from its own beginning.
            stream.next = stream.region.start_sample.max(self.position);
        }
        self.tend(self.position + BLOCK_FRAMES as i64);
        self.reap();
    }

    /// Mix one block. `out` is interleaved stereo and its length decides how
    /// many frames are wanted. Never blocks and never decodes.
    pub fn take(&mut self, out: &mut [f32]) -> Supply {
        self.reap();
        let wanted = (out.len() / CHANNELS) as i64;
        let block_end = (self.position + wanted).min(self.total);
        // The block is worked out before the decoders are tended, because which
        // clips this block will ask for is what decides which decoders have to
        // be running. See `tend`.
        self.tend(block_end);
        if self.position >= self.total {
            return Supply::End;
        }
        let frames = (block_end - self.position) as usize;

        // Ask first, mix second. A clip that is not ready must not leave the
        // ones before it in the list already consumed, or the retry hears them
        // twice.
        for index in 0..self.streams.len() {
            if !self.needs(index, block_end) {
                continue;
            }
            let overlap = self.overlap(index, block_end);
            self.fill(index, overlap * CHANNELS);
            let stream = &self.streams[index];
            // A dead clip is not starving, it is over. What it has left still
            // plays and the rest of its span is a hole.
            if !stream.dead && stream.ready() < overlap * CHANNELS {
                return Supply::Starved;
            }
        }

        out[..frames * CHANNELS].fill(0.0);
        for index in 0..self.streams.len() {
            if !self.needs(index, block_end) {
                continue;
            }
            let overlap = self.overlap(index, block_end);
            if overlap == 0 {
                continue;
            }
            let offset = (self.streams[index].next - self.position).max(0) as usize;
            let stream = &mut self.streams[index];
            let take = overlap.min(stream.ready() / CHANNELS);
            if take > 0 {
                let from = stream.consumed;
                let until = from + take * CHANNELS;
                add_into_region(
                    &mut out[..frames * CHANNELS],
                    offset,
                    &stream.pending[from..until],
                    stream.next,
                    &stream.region,
                );
                stream.consumed = until;
                if stream.consumed == stream.pending.len() {
                    stream.pending.clear();
                    stream.consumed = 0;
                }
            }
            // The whole overlap, even when only part of it could be supplied.
            // A source that ran out leaves a hole where it stopped rather than
            // sliding everything after it earlier.
            stream.next += overlap as i64;
        }

        self.position = block_end;
        Supply::Ready
    }

    /// Poll until the block is mixed or `deadline` passes.
    pub fn take_by(&mut self, out: &mut [f32], deadline: Instant) -> Supply {
        loop {
            match self.take(out) {
                Supply::Starved => {
                    if Instant::now() >= deadline {
                        return Supply::Starved;
                    }
                    std::thread::sleep(POLL);
                }
                supply => return supply,
            }
        }
    }

    /// Whether this clip has any sound inside `[position, block_end)`.
    ///
    /// `next` never goes below the clip's own start, so a clip that has not
    /// begun is one whose next sample is at or past the end of this block, and
    /// a clip that is finished is one whose next sample has reached its end.
    fn needs(&self, index: usize, block_end: i64) -> bool {
        let stream = &self.streams[index];
        stream.next < block_end && stream.next < stream.region.end_sample
    }

    /// Sample frames of this clip that belong in this block.
    fn overlap(&self, index: usize, block_end: i64) -> usize {
        let stream = &self.streams[index];
        let from = stream.next.max(self.position);
        let until = block_end.min(stream.region.end_sample);
        (until - from).max(0) as usize
    }

    /// Pull from the decoder's queue until `needed` samples are ready, or until
    /// there is nothing more to pull.
    fn fill(&mut self, index: usize, needed: usize) {
        while self.streams[index].ready() < needed && !self.streams[index].dead {
            let mut finished = None;
            let stream = &mut self.streams[index];
            match stream.receiver.as_ref().map(|queue| queue.try_recv()) {
                Some(Ok(samples)) => {
                    stream.queued.fetch_sub(samples.len(), Ordering::SeqCst);
                    // Compacting here rather than growing forever: the mixer
                    // leaves a consumed prefix behind on every block.
                    if stream.consumed > 0 {
                        stream.pending.drain(..stream.consumed);
                        stream.consumed = 0;
                    }
                    stream.pending.extend_from_slice(&samples);
                }
                Some(Err(TryRecvError::Disconnected)) => {
                    // Empty and closed: the source is over, so the clip goes
                    // silent for the rest of its span rather than holding the
                    // mix.
                    stream.dead = true;
                    stream.receiver = None;
                    finished = stream.decoder.take();
                }
                Some(Err(TryRecvError::Empty)) | None => return,
            }
            self.retiring.extend(finished);
        }
    }

    /// Start the decoders that are about to be needed and stop the ones that
    /// are done.
    ///
    /// `block_end` is where the block about to be mixed reaches, and it is part
    /// of the condition rather than only the lead. A clip that begins in the
    /// middle of that block is asked for by `take` **this block**, whatever the
    /// lead is, so its decoder has to exist by now. Starting from the lead
    /// alone leaves a clip whose start falls inside the block demanded and
    /// undecodable: `take` returns `Starved` without moving the playhead, so
    /// the next call finds exactly the same state and refuses again — a stall
    /// that never ends rather than one that clears.
    ///
    /// The frame source next door gets away with the lead alone because it
    /// steps one frame at a time, so a clip can never begin part way through a
    /// step. This one mixes a block at a time, and that is the difference.
    fn tend(&mut self, block_end: i64) {
        let (position, lead) = (self.position, self.buffering.lead);
        for index in 0..self.streams.len() {
            let stream = &self.streams[index];
            if position >= stream.region.end_sample {
                if stream.decoder.is_some() || !stream.pending.is_empty() {
                    self.retire(index);
                }
                continue;
            }
            let due = (position + lead).max(block_end - 1);
            if stream.receiver.is_none() && !stream.dead && due >= stream.region.start_sample {
                self.start(index);
            }
        }
    }

    fn start(&mut self, index: usize) {
        let position = self.position;
        let readers = Arc::clone(&self.readers);
        let depth = self.buffering.depth;
        let stream = &mut self.streams[index];
        let region = &stream.region;

        // A decoder started before its clip begins reads from the clip's own
        // first sample; one started mid-clip reads from where the playhead is.
        let from = position.max(region.start_sample);
        let wanted = region.end_sample - from;
        if wanted <= 0 {
            stream.dead = true;
            return;
        }
        // Where inside the source that is. The seek is a time because that is
        // what ffmpeg takes, and it is counted **on the engine rate**, not on
        // the project rate.
        //
        // Rescaling it to project frames instead would round a mid-clip start
        // to the nearest whole frame — up to half a frame, 16.7 ms at 30 fps —
        // while `next` below keeps the exact sample. The clip would then sound
        // that far from where the mix and the clock put it, and the length
        // would round the other way often enough to cut a hole in its tail. A
        // seek only ever lands on a whole frame from the interface, but this is
        // reachable from `Engine::seek_sample`, and a rounding that is usually
        // zero is the kind that surfaces once and cannot be reproduced.
        let engine_rate = makevideo_render::Rate::new(ENGINE_HZ, 1);
        let into_clip = from - region.start_sample;
        let request = Open {
            path: region.path.clone(),
            in_time: RationalTime::new(
                region.in_time.to_samples(ENGINE_HZ)
                    + (into_clip as f64 * region.speed as f64).round() as i64,
                engine_rate,
            ),
            duration: RationalTime::new(
                (wanted as f64 * region.speed as f64).ceil() as i64,
                engine_rate,
            ),
            frames: wanted,
            speed: region.speed,
            preserve_pitch: region.preserve_pitch,
        };

        stream.next = from;
        stream.pending.clear();
        stream.consumed = 0;

        let (sender, receiver) = sync_channel::<Vec<f32>>(depth);
        let queued = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&queued);
        let cancellation = Arc::new(DecoderCancellation::default());
        let decoder_cancellation = Arc::clone(&cancellation);
        let decoder = std::thread::spawn(move || {
            let Some(mut reader) = readers.open(&request) else {
                // Dropping the sender closes the queue, which is how the mixer
                // hears that this clip has nothing to give.
                return;
            };
            if decoder_cancellation.attach(reader.cancellation()) {
                return;
            }
            // The decoder stops at the clip's own length whatever ffmpeg
            // decides to hand over, so a source that is a sample long or a
            // sample short cannot move the clips after it.
            let mut left = request.frames * (CHANNELS as i64);
            let mut buffer = vec![0f32; BLOCK_FRAMES * CHANNELS];
            while left > 0 {
                let block = (left as usize).min(buffer.len());
                let read = reader.read(&mut buffer[..block]);
                if read == 0 {
                    break;
                }
                left -= read as i64;
                counter.fetch_add(read, Ordering::SeqCst);
                // Blocks once the queue is full, which is what bounds the
                // memory: a decoder that gets ahead simply waits.
                if sender.send(buffer[..read].to_vec()).is_err() {
                    counter.fetch_sub(read, Ordering::SeqCst);
                    break;
                }
            }
        });
        stream.receiver = Some(receiver);
        stream.queued = queued;
        stream.decoder = Some(decoder);
        stream.cancellation = cancellation;
    }

    /// Drop a clip's queue and interrupt a decoder blocked in a read. Nothing
    /// is joined here because a seek must not wait for a decoder mid-block.
    fn retire(&mut self, index: usize) {
        let stream = &mut self.streams[index];
        stream.cancellation.cancel();
        stream.receiver = None;
        stream.pending.clear();
        stream.consumed = 0;
        stream.queued = Arc::new(AtomicUsize::new(0));
        if let Some(handle) = stream.decoder.take() {
            self.retiring.push(handle);
        }
    }

    /// Join the retired threads that have already ended, so a long soak with
    /// many seeks does not accumulate them.
    fn reap(&mut self) {
        let mut index = 0;
        while index < self.retiring.len() {
            if self.retiring[index].is_finished() {
                let _ = self.retiring.swap_remove(index).join();
            } else {
                index += 1;
            }
        }
    }
}

impl Drop for MixSource {
    fn drop(&mut self) {
        for index in 0..self.streams.len() {
            self.retire(index);
        }
        // Now they are joined: leaving threads behind would leave ffmpeg
        // processes behind with them.
        for handle in self.retiring.drain(..) {
            let _ = handle.join();
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
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
}
