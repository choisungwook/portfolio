//! A scrolling capture from its first frame to the stitched image.
//!
//! The first frames can catch the selection overlay still fading out, and a
//! dimmed first frame would never match anything that follows: the stitcher
//! keeps its last frame as the reference after a miss, so every later frame
//! would be lost too. So nothing is stitched until two frames in a row are
//! nearly identical, which is the screen standing still. Nearly, because a
//! blinking caret or a spinner somewhere in the region never stops.

use crate::raster::Frame;
use crate::stitch::{Step, Stitcher, MATCH_RATIO};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Progress {
    /// Waiting for the screen to stand still before the first frame counts.
    Settling,
    Stitched(Step),
}

#[derive(Default)]
pub struct Gather {
    candidate: Option<Frame>,
    stitcher: Option<Stitcher>,
}

impl Gather {
    pub fn push(&mut self, frame: Frame) -> Result<Progress, String> {
        if let Some(stitcher) = &mut self.stitcher {
            return stitcher.push(&frame).map(Progress::Stitched);
        }
        if self
            .candidate
            .as_ref()
            .is_some_and(|last| still(last, &frame))
        {
            self.stitcher = Some(Stitcher::new(frame));
            self.candidate = None;
            return Ok(Progress::Stitched(Step::Unchanged));
        }
        self.candidate = Some(frame);
        Ok(Progress::Settling)
    }

    /// Rows gathered so far, 0 while settling.
    pub fn height(&self) -> usize {
        self.stitcher.as_ref().map_or(0, Stitcher::height)
    }

    /// The stitched image. A screen that never stood still, a playing video
    /// say, still gives its last frame rather than nothing, so Done always
    /// ends in a capture. None only when no frame arrived at all.
    pub fn finish(self) -> Option<Frame> {
        self.stitcher.map(Stitcher::finish).or(self.candidate)
    }
}

/// Same size and at least `MATCH_RATIO` of the rows unchanged.
fn still(a: &Frame, b: &Frame) -> bool {
    if a.width != b.width || a.height != b.height {
        return false;
    }
    let same = (0..a.height).filter(|&y| a.row(y) == b.row(y)).count();
    same as f64 >= a.height as f64 * MATCH_RATIO
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(seed: u8, height: usize) -> Frame {
        Frame {
            width: 2,
            height,
            rgba: (0..height * 8)
                .map(|i| (i as u8).wrapping_mul(seed))
                .collect(),
        }
    }

    // A dimmed frame left over from the overlay must not become the reference.
    #[test]
    fn starts_only_once_two_frames_match() {
        let mut gather = Gather::default();
        assert_eq!(gather.push(frame(3, 40)), Ok(Progress::Settling));
        assert_eq!(gather.push(frame(5, 40)), Ok(Progress::Settling));
        assert_eq!(gather.height(), 0);
        assert_eq!(
            gather.push(frame(5, 40)),
            Ok(Progress::Stitched(Step::Unchanged))
        );
        assert_eq!(gather.height(), 40);
        assert_eq!(
            gather.push(frame(5, 40)),
            Ok(Progress::Stitched(Step::Unchanged))
        );
        assert_eq!(gather.finish(), Some(frame(5, 40)));
    }

    // A caret blinking on one row of forty does not stop the start.
    #[test]
    fn one_changed_row_still_counts_as_still() {
        let mut gather = Gather::default();
        let mut blink = frame(5, 40);
        blink.rgba[0] ^= 0xff;
        gather.push(frame(5, 40)).unwrap();
        assert_eq!(gather.push(blink), Ok(Progress::Stitched(Step::Unchanged)));
    }

    #[test]
    fn a_screen_that_never_settles_gives_its_last_frame() {
        let mut gather = Gather::default();
        assert_eq!(Gather::default().finish(), None);
        gather.push(frame(3, 40)).unwrap();
        gather.push(frame(7, 40)).unwrap();
        assert_eq!(gather.finish(), Some(frame(7, 40)));
    }
}
