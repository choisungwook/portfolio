//! Time, expressed once, as a count of frames on a rate.
//!
//! Every other crate used to say time in whole milliseconds. That works right
//! up to the moment a real camera file arrives: 29.97 is 30000/1001, and a
//! frame of it is 33.3667 ms. Rounded to 33 it is nearly a frame out after ten
//! seconds and visibly out after a minute, and the same rounding happens again
//! in the other direction whenever a frame index is asked for. Nothing in the
//! app could hold 29.97 in the first place, because the frame rate was a u32.
//!
//! So a time here is a `value` counted in units of `1/rate` seconds, and a
//! `Rate` is two integers. A frame index *is* a time — no division, so nothing
//! to round — and conversion, addition, subtraction, comparison, clamping and
//! rescaling all live in this one file. They are together on purpose: a frame
//! that lands one off only shows up on particular pairs of rates, which is not
//! something anybody finds by hand.

use serde::{Deserialize, Serialize};

/// Frames per second as `num/den`, so 29.97 is stored as the 30000/1001 it
/// really is rather than as a decimal that has to be approximated back.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(from = "RateWire", into = "RateWire")]
pub struct Rate {
    num: u32,
    den: u32,
}

/// What a rate looks like in a project file. Going through it on the way in is
/// what guarantees the pair is reduced and non-zero however the file was
/// written: `Rate` itself has no way to hold 0/0.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RateWire {
    num: u32,
    den: u32,
}

impl From<RateWire> for Rate {
    fn from(wire: RateWire) -> Rate {
        Rate::new(wire.num, wire.den)
    }
}

impl From<Rate> for RateWire {
    fn from(rate: Rate) -> RateWire {
        RateWire {
            num: rate.num,
            den: rate.den,
        }
    }
}

impl Default for Rate {
    fn default() -> Self {
        Rate::fps(30)
    }
}

fn gcd(a: u32, b: u32) -> u32 {
    let (mut a, mut b) = (a, b);
    while b != 0 {
        let next = a % b;
        a = b;
        b = next;
    }
    a.max(1)
}

impl Rate {
    /// Reduced on the way in, so 60000/2002 and 30000/1001 are the same rate
    /// and compare equal. A zero on either side is not a rate at all and falls
    /// back to 30, because a project file that says nothing usable should open.
    pub fn new(num: u32, den: u32) -> Rate {
        if num == 0 || den == 0 {
            return Rate { num: 30, den: 1 };
        }
        let divisor = gcd(num, den);
        Rate {
            num: num / divisor,
            den: den / divisor,
        }
    }

    /// A whole number of frames per second: 24, 25, 30, 50, 60.
    pub fn fps(frames: u32) -> Rate {
        Rate::new(frames, 1)
    }

    /// The NTSC relative of a whole rate, which is that rate times 1000/1001:
    /// `ntsc(24)` is 23.976, `ntsc(30)` is 29.97, `ntsc(60)` is 59.94.
    pub fn ntsc(frames: u32) -> Rate {
        Rate::new(frames * 1000, 1001)
    }

    pub fn num(self) -> u32 {
        self.num
    }

    pub fn den(self) -> u32 {
        self.den
    }

    pub fn as_f64(self) -> f64 {
        f64::from(self.num) / f64::from(self.den)
    }

    /// Every rate the app offers, in the order the picker shows them.
    pub fn standard() -> Vec<Rate> {
        vec![
            Rate::ntsc(24),
            Rate::fps(24),
            Rate::fps(25),
            Rate::ntsc(30),
            Rate::fps(30),
            Rate::fps(50),
            Rate::ntsc(60),
            Rate::fps(60),
        ]
    }

    /// "30" or "29.97". Three decimals covers 23.976 and trailing zeros come
    /// off, so 29.970 reads as the 29.97 everybody writes.
    pub fn label(self) -> String {
        if self.den == 1 {
            return self.num.to_string();
        }
        let text = format!("{:.3}", self.as_f64());
        text.trim_end_matches('0').trim_end_matches('.').to_string()
    }

    /// "30000/1001" for a file or a filter argument, "30" when the denominator
    /// is 1. ffmpeg takes both, and the ratio is the one that stays exact.
    pub fn ratio_text(self) -> String {
        if self.den == 1 {
            self.num.to_string()
        } else {
            format!("{}/{}", self.num, self.den)
        }
    }

    /// "30", "30000/1001" or "29.97". The last form is what an older project
    /// file holds, so it goes through `nearest` rather than being believed.
    pub fn parse(text: &str) -> Option<Rate> {
        let text = text.trim();
        if let Some((num, den)) = text.split_once('/') {
            return Some(Rate::new(num.trim().parse().ok()?, den.trim().parse().ok()?));
        }
        Some(Rate::nearest(text.parse::<f64>().ok()?))
    }

    /// The standard rate a decimal was meant to be. 29.97 written out is not
    /// 30000/1001, it is 0.00003 away from it, and storing the decimal is how
    /// the approximation this whole crate removes gets back in.
    pub fn nearest(value: f64) -> Rate {
        if !(value.is_finite() && value > 0.0) {
            return Rate::fps(30);
        }
        for candidate in Rate::standard() {
            if (candidate.as_f64() - value).abs() < 0.005 {
                return candidate;
            }
        }
        Rate::new((value * 1000.0).round() as u32, 1000)
    }
}

/// Integer division rounded half away from zero. `den` is always positive here
/// because it comes from a `Rate`.
fn div_round(num: i128, den: i128) -> i128 {
    if num >= 0 {
        (num + den / 2) / den
    } else {
        -((-num + den / 2) / den)
    }
}

/// A point in time, or a length of it: `value` units of `1/rate` seconds.
///
/// With `rate` the project frame rate the value is simply the frame index, so
/// "the time of frame 900" needs no arithmetic at all. That is the property the
/// millisecond model could not have.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RationalTime {
    value: i64,
    rate: Rate,
}

impl RationalTime {
    pub fn new(value: i64, rate: Rate) -> RationalTime {
        RationalTime { value, rate }
    }

    pub fn zero(rate: Rate) -> RationalTime {
        RationalTime { value: 0, rate }
    }

    pub fn value(self) -> i64 {
        self.value
    }

    pub fn rate(self) -> Rate {
        self.rate
    }

    // --- conversion --------------------------------------------------------

    pub fn from_seconds(seconds: f64, rate: Rate) -> RationalTime {
        RationalTime::new((seconds * rate.as_f64()).round() as i64, rate)
    }

    /// The way in from anything that still measures in milliseconds: ffprobe
    /// durations, a media element's `currentTime`, a project file written
    /// before this crate existed.
    pub fn from_millis(millis: i64, rate: Rate) -> RationalTime {
        let value = div_round(
            millis as i128 * i128::from(rate.num),
            i128::from(rate.den) * 1000,
        );
        RationalTime::new(value as i64, rate)
    }

    pub fn to_seconds(self) -> f64 {
        self.value as f64 * f64::from(self.rate.den) / f64::from(self.rate.num)
    }

    /// Rounded, and only for the places that still speak milliseconds: the
    /// render progress bar and the numbers in a quality report. Nothing that
    /// decides where a frame goes may go through here.
    pub fn to_millis(self) -> i64 {
        div_round(
            self.value as i128 * i128::from(self.rate.den) * 1000,
            i128::from(self.rate.num),
        ) as i64
    }

    /// The same instant counted in audio samples. `adelay` takes a sample
    /// count with an `S` suffix, which is how audio lands exactly where the
    /// picture does instead of within half a millisecond of it.
    pub fn to_samples(self, hz: u32) -> i64 {
        div_round(
            self.value as i128 * i128::from(self.rate.den) * i128::from(hz),
            i128::from(self.rate.num),
        ) as i64
    }

    /// Seconds as a decimal string, rounded at the last place with integer
    /// arithmetic rather than through f64. This is what ffmpeg's `-ss` and
    /// `-t` take; six places puts the error under a microsecond, which is four
    /// orders of magnitude below a frame.
    pub fn seconds_text(self, decimals: u32) -> String {
        let scale = 10i128.pow(decimals);
        let scaled = div_round(
            self.value as i128 * i128::from(self.rate.den) * scale,
            i128::from(self.rate.num),
        );
        let sign = if scaled < 0 { "-" } else { "" };
        let magnitude = scaled.unsigned_abs();
        let whole = magnitude / scale as u128;
        if decimals == 0 {
            return format!("{sign}{whole}");
        }
        let fraction = magnitude % scale as u128;
        format!("{sign}{whole}.{fraction:0width$}", width = decimals as usize)
    }

    // --- rescale, add, subtract, clamp -------------------------------------

    /// The same instant counted on another rate, rounded to the nearest whole
    /// frame of it. Exact whenever the rates divide — 30 to 60 doubles, 60 to
    /// 30 halves — and as close as the target allows when they do not.
    pub fn rescaled(self, rate: Rate) -> RationalTime {
        if rate == self.rate {
            return self;
        }
        let value = div_round(
            self.value as i128 * i128::from(self.rate.den) * i128::from(rate.num),
            i128::from(self.rate.num) * i128::from(rate.den),
        );
        RationalTime::new(value as i64, rate)
    }

    /// Answers on the left hand rate, because the left hand side is the one the
    /// caller is working in: a clip start plus a length is still a position on
    /// the timeline.
    pub fn add(self, other: RationalTime) -> RationalTime {
        RationalTime::new(self.value + other.rescaled(self.rate).value, self.rate)
    }

    pub fn sub(self, other: RationalTime) -> RationalTime {
        RationalTime::new(self.value - other.rescaled(self.rate).value, self.rate)
    }

    /// Held between two bounds and answered on this time's own rate. A `high`
    /// below `low` is a caller mistake rather than a reason to panic, so `low`
    /// wins.
    pub fn clamped(self, low: RationalTime, high: RationalTime) -> RationalTime {
        let low = low.rescaled(self.rate).value;
        let high = high.rescaled(self.rate).value.max(low);
        RationalTime::new(self.value.clamp(low, high), self.rate)
    }
}

/// Two times are equal when they are the same instant, whatever they are
/// counted in: frame 1 at 30 and frame 2 at 60 are one thirtieth of a second
/// either way. Compared by cross multiplication in i128, so the comparison
/// itself never rounds.
impl PartialEq for RationalTime {
    fn eq(&self, other: &RationalTime) -> bool {
        self.cmp(other) == std::cmp::Ordering::Equal
    }
}

impl Eq for RationalTime {}

impl Ord for RationalTime {
    fn cmp(&self, other: &RationalTime) -> std::cmp::Ordering {
        let left = self.value as i128 * i128::from(self.rate.den) * i128::from(other.rate.num);
        let right = other.value as i128 * i128::from(other.rate.den) * i128::from(self.rate.num);
        left.cmp(&right)
    }
}

impl PartialOrd for RationalTime {
    fn partial_cmp(&self, other: &RationalTime) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The rates the app offers, which is also the list every conversion test
    /// runs over: a frame that lands one off tends to do it on one pair only.
    fn rates() -> Vec<Rate> {
        Rate::standard()
    }

    #[test]
    fn ntsc_rates_are_ratios_rather_than_decimals() {
        assert_eq!((Rate::ntsc(30).num(), Rate::ntsc(30).den()), (30000, 1001));
        assert_eq!((Rate::ntsc(24).num(), Rate::ntsc(24).den()), (24000, 1001));
        assert_eq!((Rate::ntsc(60).num(), Rate::ntsc(60).den()), (60000, 1001));
    }

    #[test]
    fn a_rate_is_reduced_so_the_same_rate_is_one_value() {
        assert_eq!(Rate::new(60000, 2002), Rate::ntsc(30));
        assert_eq!(Rate::new(60, 2), Rate::fps(30));
        // Nothing usable in the file: opening it matters more than refusing it.
        assert_eq!(Rate::new(0, 0), Rate::fps(30));
    }

    #[test]
    fn every_offered_rate_reads_and_writes_the_way_people_write_it() {
        let expected = [
            "23.976", "24", "25", "29.97", "30", "50", "59.94", "60",
        ];
        for (rate, label) in rates().iter().zip(expected) {
            assert_eq!(rate.label(), label, "{rate:?}");
            assert_eq!(Rate::parse(label), Some(*rate), "{label}");
            assert_eq!(Rate::parse(&rate.ratio_text()), Some(*rate));
        }
    }

    #[test]
    fn a_decimal_frame_rate_snaps_back_to_the_ratio_it_meant() {
        // What an older project file holds, and what makes it exact again.
        assert_eq!(Rate::nearest(29.97), Rate::ntsc(30));
        assert_eq!(Rate::nearest(23.976), Rate::ntsc(24));
        assert_eq!(Rate::nearest(59.94), Rate::ntsc(60));
        assert_eq!(Rate::nearest(30.0), Rate::fps(30));
        assert_eq!(Rate::nearest(0.0), Rate::fps(30));
    }

    #[test]
    fn a_frame_index_is_the_time_so_nothing_accumulates() {
        // The millisecond model rounded here and the error added up. Adding one
        // frame ten thousand times has to land exactly on frame ten thousand,
        // on every rate, or the picture drifts away from the sound.
        for rate in rates() {
            let step = RationalTime::new(1, rate);
            let mut running = RationalTime::zero(rate);
            for _ in 0..10_000 {
                running = running.add(step);
            }
            assert_eq!(running, RationalTime::new(10_000, rate), "{rate:?}");
        }
    }

    #[test]
    fn the_millisecond_model_it_replaces_was_a_frame_out_within_a_minute() {
        // 30 fps, the old frame_time_ms: index * 1000 / fps in whole
        // milliseconds. At frame 1800 the true time is 60000 ms, and this is
        // what the app used to seek to.
        let old_ms = 1800u64 * 1000 / 30;
        assert_eq!(old_ms, 60_000, "30 divides 1000 evenly, so 30 was fine");
        assert_eq!(
            RationalTime::new(1800, Rate::fps(30)).to_millis(),
            old_ms as i64
        );

        // 29.97 could not even be written down, but the arithmetic it would
        // have had is index * 1000 / 30, and that is 60 ms short of a second by
        // frame 1800 — nearly two frames.
        let ntsc = Rate::ntsc(30);
        let truth = RationalTime::new(1800, ntsc).to_millis();
        assert_eq!(truth, 60_060);
        assert_eq!(truth - old_ms as i64, 60);
    }

    #[test]
    fn seconds_come_out_exact_enough_for_ffmpeg_to_seek_with() {
        assert_eq!(RationalTime::new(1, Rate::fps(30)).seconds_text(6), "0.033333");
        assert_eq!(
            RationalTime::new(1, Rate::ntsc(30)).seconds_text(6),
            "0.033367"
        );
        // One second of 29.97 is 30 frames and 1001/1000 seconds of wall clock.
        assert_eq!(RationalTime::new(30, Rate::ntsc(30)).seconds_text(6), "1.001000");
        assert_eq!(RationalTime::new(0, Rate::fps(25)).seconds_text(6), "0.000000");
        assert_eq!(RationalTime::new(-30, Rate::fps(30)).seconds_text(3), "-1.000");
    }

    #[test]
    fn milliseconds_go_in_and_the_nearest_frame_comes_out() {
        // The boundary every imported asset crosses: ffprobe says milliseconds.
        assert_eq!(RationalTime::from_millis(1000, Rate::fps(30)).value(), 30);
        assert_eq!(RationalTime::from_millis(1000, Rate::ntsc(30)).value(), 30);
        assert_eq!(RationalTime::from_millis(1001, Rate::ntsc(30)).value(), 30);
        assert_eq!(RationalTime::from_millis(0, Rate::ntsc(24)).value(), 0);
        assert_eq!(RationalTime::from_millis(-1000, Rate::fps(25)).value(), -25);
    }

    #[test]
    fn milliseconds_come_back_within_half_a_frame_on_every_rate() {
        // Not within a millisecond: ten seconds is 239.76 frames of 23.976, and
        // there is no such frame. Landing on the nearest one and staying there
        // is the whole bargain, so what is checked is that the quantising never
        // costs more than half a frame.
        for rate in rates() {
            let half_frame_ms = 500.0 / rate.as_f64();
            let out = RationalTime::from_millis(10_000, rate).to_millis();
            assert!(
                (out - 10_000).abs() as f64 <= half_frame_ms + 1.0,
                "{rate:?} came back as {out}"
            );
        }
    }

    #[test]
    fn rescaling_is_exact_when_the_rates_divide() {
        let at_thirty = RationalTime::new(90, Rate::fps(30));
        assert_eq!(at_thirty.rescaled(Rate::fps(60)).value(), 180);
        assert_eq!(at_thirty.rescaled(Rate::fps(60)).rescaled(Rate::fps(30)), at_thirty);
        // 23.976 to 24 is the pair that cannot be exact, so it lands on the
        // nearest frame instead of somewhere between two.
        let ntsc = RationalTime::new(24, Rate::ntsc(24));
        assert_eq!(ntsc.rescaled(Rate::fps(24)).value(), 24);
        // 23.976 runs slower, so a thousand of its frames is a thousand and one
        // frames of 24. Off by one in the other direction is the bug this
        // rounding exists to make impossible to write by accident.
        assert_eq!(
            RationalTime::new(1000, Rate::ntsc(24))
                .rescaled(Rate::fps(24))
                .value(),
            1001
        );
    }

    #[test]
    fn rescaling_holds_the_instant_still() {
        for rate in rates() {
            for other in rates() {
                let time = RationalTime::new(600, rate);
                let moved = time.rescaled(other);
                let error = (moved.to_seconds() - time.to_seconds()).abs();
                // Never more than half a frame of wherever it landed.
                assert!(
                    error <= 0.5 / other.as_f64() + 1e-9,
                    "{rate:?} to {other:?} moved by {error}"
                );
            }
        }
    }

    #[test]
    fn times_compare_as_instants_rather_than_as_counts() {
        assert_eq!(
            RationalTime::new(1, Rate::fps(30)),
            RationalTime::new(2, Rate::fps(60))
        );
        assert!(RationalTime::new(1, Rate::fps(30)) < RationalTime::new(1, Rate::fps(25)));
        // 29.97 runs slower than 30, so the same frame number is later on it.
        assert!(RationalTime::new(100, Rate::fps(30)) < RationalTime::new(100, Rate::ntsc(30)));
    }

    #[test]
    fn adding_a_length_on_another_rate_answers_on_this_one() {
        let start = RationalTime::new(30, Rate::fps(30));
        let length = RationalTime::new(60, Rate::fps(60));
        let end = start.add(length);
        assert_eq!(end.rate(), Rate::fps(30));
        assert_eq!(end.value(), 60);
        assert_eq!(end.sub(length), start);
    }

    #[test]
    fn clamping_answers_on_this_time_own_rate() {
        let rate = Rate::ntsc(30);
        let low = RationalTime::new(0, rate);
        let high = RationalTime::new(100, rate);
        assert_eq!(RationalTime::new(-5, rate).clamped(low, high).value(), 0);
        assert_eq!(RationalTime::new(500, rate).clamped(low, high).value(), 100);
        assert_eq!(RationalTime::new(50, rate).clamped(low, high).value(), 50);
        // A bound given on another rate is rescaled first, and the answer stays
        // in the rate that was clamped.
        let held = RationalTime::new(90, Rate::fps(30)).clamped(low, RationalTime::new(30, rate));
        assert_eq!(held.rate(), Rate::fps(30));
        assert_eq!(held.value(), 30);
        // An upside down pair does not panic.
        assert_eq!(RationalTime::new(50, rate).clamped(high, low).value(), 100);
    }

    #[test]
    fn audio_lands_on_a_sample_rather_than_on_a_millisecond() {
        // Two seconds at 48 kHz, exactly, and the awkward case: one frame of
        // 29.97 is 1601.6 samples, so the rounding is visible and bounded.
        assert_eq!(RationalTime::new(60, Rate::fps(30)).to_samples(48_000), 96_000);
        assert_eq!(RationalTime::new(1, Rate::ntsc(30)).to_samples(48_000), 1602);
        assert_eq!(RationalTime::new(30, Rate::ntsc(30)).to_samples(48_000), 48_048);
    }

    #[test]
    fn a_rate_round_trips_through_a_project_file_as_two_integers() {
        let text = serde_json::to_string(&Rate::ntsc(30)).unwrap();
        assert_eq!(text, r#"{"num":30000,"den":1001}"#);
        assert_eq!(serde_json::from_str::<Rate>(&text).unwrap(), Rate::ntsc(30));
        // Whatever a file holds, what comes back is a usable rate.
        assert_eq!(
            serde_json::from_str::<Rate>(r#"{"num":0,"den":0}"#).unwrap(),
            Rate::fps(30)
        );
    }
}
