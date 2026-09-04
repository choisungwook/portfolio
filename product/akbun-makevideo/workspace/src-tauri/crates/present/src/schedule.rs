//! When a frame is shown.
//!
//! This is the whole of the problem this crate exists for. Drawing a frame is
//! settled — one shader, two backends, a test that they agree. Getting one is
//! settled — a decoder per clip, each buffering ahead. What was missing is the
//! answer to *now, or not yet, or never*, and that answer is here, in one
//! function over two integers.
//!
//! It is a pure function on purpose. Timing faults do not reproduce: a stutter
//! is a thing that happened once on a machine that was also doing something
//! else, and chasing it by watching the screen is how this problem stays
//! unsolved. Everything that can be decided without a clock, a thread or a
//! graphics device is decided in [`step`], and every boundary of it is a test
//! that runs in microseconds.

/// What to do with the frame the source will hand over next.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// It is due now. Take it, draw it.
    Present,
    /// The clock is past it. Take it and throw it away.
    ///
    /// This is the rule the issue is about: a frame that is already late is
    /// never made current by drawing it, it is only in the way of the one that
    /// is. Skipping costs a decoded frame; drawing it costs that *and* leaves
    /// the picture behind the sound, and every frame after it inherits the
    /// lateness.
    Skip,
    /// The clock has not reached it. Leave what is on screen alone.
    Hold,
    /// So far behind that walking there would cost more than jumping. Move the
    /// source to this frame.
    ///
    /// Always forward — the argument is the clock's own position, and this arm
    /// is only reached when the clock is ahead. Nothing here ever asks a
    /// decoder to go back, because a decoder sent backwards is the stall this
    /// was supposed to fix.
    Resync(i64),
}

/// How far behind the clock the source may fall before it jumps instead of
/// walking.
///
/// Fifteen frames is half a second at 30 fps. The trade is one-sided in both
/// directions and the crossing point is what this number is: skipping walks
/// through every frame in between, so a two second gap means decoding sixty
/// frames nobody sees, while a jump throws the queues away and refills them,
/// which the frame source measures at about 130 ms. Below the threshold
/// skipping is cheaper and keeps the picture live; above it the refill wins.
pub const DEFAULT_RESYNC: i64 = 15;

/// Decide what happens to the frame at `next`, given that the clock is at
/// `clock`.
///
/// Both are frame indices on the project rate. `clock` comes from the audio
/// clock through [`crate::player::clock_frame`], which is the one place the
/// sound's position becomes a picture's position.
pub fn step(next: i64, clock: i64, resync_after: i64) -> Step {
    if next > clock {
        return Step::Hold;
    }
    if next == clock {
        return Step::Present;
    }
    // Behind. Floored at two, because a threshold of one means jumping the
    // moment the picture is a single frame late: a 130 ms refill traded for a
    // 33 ms skip, which is a loss at every rate the app offers. The floor is
    // here rather than at the caller because a setting nobody validated is
    // exactly how a value like that arrives.
    if clock - next >= resync_after.max(2) {
        return Step::Resync(clock);
    }
    Step::Skip
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_frame_the_clock_is_on_is_the_one_that_is_shown() {
        assert_eq!(step(100, 100, DEFAULT_RESYNC), Step::Present);
    }

    #[test]
    fn a_frame_the_clock_has_not_reached_waits() {
        assert_eq!(step(101, 100, DEFAULT_RESYNC), Step::Hold);
        assert_eq!(step(400, 100, DEFAULT_RESYNC), Step::Hold);
    }

    #[test]
    fn a_late_frame_is_skipped_rather_than_drawn() {
        assert_eq!(step(99, 100, DEFAULT_RESYNC), Step::Skip);
        assert_eq!(step(87, 100, DEFAULT_RESYNC), Step::Skip);
    }

    /// The boundary, both sides of it. One frame short of the threshold walks
    /// and the threshold itself jumps, so a change to the constant cannot
    /// quietly move which side is which.
    #[test]
    fn the_resync_threshold_is_where_skipping_stops() {
        assert_eq!(step(86, 100, 15), Step::Skip);
        assert_eq!(step(85, 100, 15), Step::Resync(100));
        assert_eq!(step(0, 100, 15), Step::Resync(100));
    }

    /// The ADR the issue carries: the decoder is never sent backwards. A resync
    /// target is the clock, and the clock is ahead of the source in the only
    /// arm that produces one.
    #[test]
    fn a_resync_never_asks_the_source_to_go_back() {
        for next in -5..200i64 {
            for clock in -5..200i64 {
                if let Step::Resync(target) = step(next, clock, 15) {
                    assert!(
                        target > next,
                        "resync from {next} to {target} is backwards (clock {clock})"
                    );
                    assert_eq!(target, clock);
                }
            }
        }
    }

    /// Every position produces exactly one of the four, and which one is
    /// decided only by the distance. Written as a sweep rather than as cases
    /// because the thing worth knowing is that there is no gap between them.
    #[test]
    fn every_distance_has_one_answer() {
        let clock = 1_000;
        for next in 0..2_000i64 {
            let answer = step(next, clock, 15);
            let expected = if next > clock {
                Step::Hold
            } else if next == clock {
                Step::Present
            } else if clock - next >= 15 {
                Step::Resync(clock)
            } else {
                Step::Skip
            };
            assert_eq!(answer, expected, "next {next}");
        }
    }

    /// A threshold of zero or one would turn a single late frame into a refill:
    /// 130 ms of emptying and filling the queues in place of one 33 ms skip.
    /// The value is floored rather than trusted, because an unvalidated setting
    /// is how a number like that arrives.
    #[test]
    fn a_threshold_below_two_still_walks_the_first_late_frame() {
        for threshold in [-4, 0, 1, 2] {
            assert_eq!(
                step(99, 100, threshold),
                Step::Skip,
                "threshold {threshold}"
            );
        }
        assert_eq!(step(98, 100, 0), Step::Resync(100));
        assert_eq!(step(98, 100, 2), Step::Resync(100));
        assert_eq!(step(98, 100, 3), Step::Skip);
    }

    /// The playhead at the top of the timeline is frame 0, and a clock that has
    /// not started is 0 too. That has to be `Present` and not a resync, or
    /// pressing play would seek before it drew anything.
    #[test]
    fn the_start_of_the_timeline_presents() {
        assert_eq!(step(0, 0, DEFAULT_RESYNC), Step::Present);
    }
}
