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
pub(crate) mod tests;
