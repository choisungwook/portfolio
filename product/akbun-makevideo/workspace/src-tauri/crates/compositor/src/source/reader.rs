//! Reading decoded frames

use super::*;

pub(super) trait LifecycleClock: Send + Sync {
    fn now(&self) -> Duration;
}

pub(super) struct SystemClock {
    started: Instant,
}

impl SystemClock {
    pub(super) fn new() -> SystemClock {
        SystemClock {
            started: Instant::now(),
        }
    }
}

impl LifecycleClock for SystemClock {
    fn now(&self) -> Duration {
        self.started.elapsed()
    }
}

/// Raw frames for one clip, in order, already scaled to the size they will be
/// drawn at.
///
/// The ffmpeg process is the only implementation the app uses. The trait exists
/// because the buffering is the part that can be wrong, and it can be tested
/// exactly and quickly against a reader that hands back bytes on demand.
pub trait FrameReader: Send {
    /// Fill `buffer` with the next frame. `false` means the source is over,
    /// whether it ran out or broke; either way the clip stops drawing.
    fn read(&mut self, buffer: &mut [u8]) -> bool;

    /// A handle that can interrupt a blocking `read`, when the reader supports
    /// it. The ffmpeg reader uses this to kill its process on seek or drop.
    fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
        None
    }
}

/// Stops a reader without needing access to the thread currently reading it.
pub trait CancelRead: Send + Sync {
    fn cancel(&self);
}

/// What one clip's decoder is asked for. Owned, because the open happens on the
/// decoder's own thread — a process spawn on the consumer's thread would be a
/// stall on the playhead.
#[derive(Debug, Clone, PartialEq)]
pub struct Open {
    pub path: String,
    pub kind: AssetKind,
    /// Frame of the source to start at, and how many frames are wanted from it.
    pub in_frame: i64,
    pub frames: i64,
    pub width: u32,
    pub height: u32,
    pub rate: Rate,
    pub speed: f32,
    pub crop: makevideo_render::Crop,
    pub head_pad_frames: i64,
}

/// Opens the readers.
pub trait Readers: Send + Sync {
    /// `None` means this clip cannot be decoded. It stops drawing, which is the
    /// same hole the timeline shows for media that has moved.
    fn open(&self, request: &Open) -> Option<Box<dyn FrameReader>>;
}

/// The real one: an ffmpeg process per clip, decoding to raw RGBA.
pub struct FfmpegReaders {
    pub ffmpeg: String,
    /// The decode hint confirmed by `accel::candidates`, or None for software.
    pub hwaccel: Option<String>,
}

impl FfmpegReaders {
    pub fn new(ffmpeg: &str, hwaccel: Option<&str>) -> FfmpegReaders {
        FfmpegReaders {
            ffmpeg: ffmpeg.to_string(),
            hwaccel: hwaccel.map(|name| name.to_string()),
        }
    }
}

impl Readers for FfmpegReaders {
    fn open(&self, request: &Open) -> Option<Box<dyn FrameReader>> {
        let decode = ffmpeg::Decode {
            path: &request.path,
            kind: request.kind,
            in_time: RationalTime::new(request.in_frame, request.rate),
            duration: RationalTime::new(
                (((request.frames - request.head_pad_frames).max(1) as f64 * request.speed as f64)
                    .ceil() as i64)
                    .max(1),
                request.rate,
            ),
            width: request.width,
            height: request.height,
            rate: request.rate,
            speed: request.speed,
            // A still has nothing to decode, so no hint for it.
            hwaccel: if request.kind == AssetKind::Video {
                self.hwaccel.as_deref()
            } else {
                None
            },
            crop: request.crop,
            head_pad_frames: request.head_pad_frames,
        };
        let fallback = decode.hwaccel.map(|_| {
            let software = ffmpeg::decoder_args(&ffmpeg::Decode {
                path: &request.path,
                kind: request.kind,
                in_time: RationalTime::new(request.in_frame, request.rate),
                duration: RationalTime::new(
                    (((request.frames - request.head_pad_frames).max(1) as f64
                        * request.speed as f64)
                        .ceil() as i64)
                        .max(1),
                    request.rate,
                ),
                width: request.width,
                height: request.height,
                rate: request.rate,
                speed: request.speed,
                hwaccel: None,
                crop: request.crop,
                head_pad_frames: request.head_pad_frames,
            });
            (self.ffmpeg.clone(), software)
        });
        let args = ffmpeg::decoder_args(&decode);
        FfmpegReader::start(&self.ffmpeg, &args, fallback)
            .map(|reader| Box::new(reader) as Box<dyn FrameReader>)
    }
}

pub(super) struct FfmpegReader {
    child: Arc<Mutex<Child>>,
    cancelled: Arc<AtomicBool>,
    stdout: ChildStdout,
    fallback: Option<(String, Vec<String>)>,
    began: bool,
}

impl FfmpegReader {
    pub(super) fn start(
        ffmpeg: &str,
        args: &[String],
        fallback: Option<(String, Vec<String>)>,
    ) -> Option<FfmpegReader> {
        let (child, stdout) = Self::spawn(ffmpeg, args)?;
        Some(FfmpegReader {
            child: Arc::new(Mutex::new(child)),
            cancelled: Arc::new(AtomicBool::new(false)),
            stdout,
            fallback,
            began: false,
        })
    }

    pub(super) fn spawn(ffmpeg: &str, args: &[String]) -> Option<(Child, ChildStdout)> {
        let mut child = Command::new(ffmpeg)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            // A decoder that cannot open its file stops drawing rather than
            // reporting, so there is nothing to read from stderr.
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let stdout = child.stdout.take()?;
        Some((child, stdout))
    }

    pub(super) fn retry_with_software(&mut self) -> bool {
        let Some((ffmpeg, args)) = self.fallback.take() else {
            return false;
        };
        // Keep the stable slot locked through replacement. A cancellation
        // racing the fallback then waits and kills the new child, rather than
        // returning after killing only the child that just failed.
        let mut current = self.child.lock().unwrap();
        let _ = current.kill();
        let _ = current.wait();
        if self.cancelled.load(Ordering::SeqCst) {
            return false;
        }
        let Some((child, stdout)) = Self::spawn(&ffmpeg, &args) else {
            return false;
        };
        *current = child;
        self.stdout = stdout;
        true
    }
}

pub(super) struct FfmpegCancel {
    child: Arc<Mutex<Child>>,
    cancelled: Arc<AtomicBool>,
}

impl CancelRead for FfmpegCancel {
    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        let _ = self.child.lock().unwrap().kill();
    }
}

impl FrameReader for FfmpegReader {
    fn read(&mut self, buffer: &mut [u8]) -> bool {
        if self.stdout.read_exact(buffer).is_ok() {
            self.began = true;
            return true;
        }
        if self.began || !self.retry_with_software() || self.stdout.read_exact(buffer).is_err() {
            return false;
        }
        self.began = true;
        true
    }

    fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
        Some(Arc::new(FfmpegCancel {
            child: Arc::clone(&self.child),
            cancelled: Arc::clone(&self.cancelled),
        }))
    }
}

impl Drop for FfmpegReader {
    /// The decoder thread ends when the consumer drops its end of the queue,
    /// and this is what stops the process it was feeding. Without it a seek
    /// would leave an ffmpeg per clip writing into a pipe nobody reads.
    fn drop(&mut self) {
        let mut child = self.child.lock().unwrap();
        let _ = child.kill();
        let _ = child.wait();
    }
}
