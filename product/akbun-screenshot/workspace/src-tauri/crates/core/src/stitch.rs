//! Joins the frames of a scrolling capture into one tall image.
//!
//! Every frame is the same screen region. Rows are compared by hash: when the
//! content has scrolled up by `s` rows, the last frame's rows from `s` down
//! equal the new frame's rows from the top. The rows below that overlap are
//! new and get appended.
//!
//! A sticky header or footer does not scroll, so it would break that
//! equality. Rows that are equal at the same position in both frames are
//! treated as fixed bands: they are left out of the comparison, and new rows go
//! in above the footer rather than below it.

use crate::raster::Frame;

/// Fewer body rows than this and there is nothing to compare reliably.
const MIN_BODY_ROWS: usize = 8;
/// A shift needs this many compared rows with real content. A run of blank
/// rows matches at every shift and proves nothing.
const MIN_INFORMATIVE_ROWS: usize = 8;
/// Share of informative rows that must match. Not 100%, so a blinking caret
/// or a hover highlight does not lose the frame.
pub const MATCH_RATIO: f64 = 0.95;
/// About 30 screens of a retina display. Past this the image is too big to be
/// useful and memory grows without bound.
pub const MAX_HEIGHT: usize = 32_768;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// Nothing scrolled.
    Unchanged,
    /// This many new rows were added.
    Appended(usize),
    /// No overlap with the last frame: scrolled too far in one step, scrolled
    /// up, or the content changed. The frame is dropped.
    Lost,
    /// The image reached `MAX_HEIGHT`. Later frames are ignored.
    Full,
}

pub struct Stitcher {
    image: Frame,
    last: Vec<RowKey>,
}

/// A row's hash and whether the row is a single flat colour.
#[derive(Clone, Copy, PartialEq, Eq)]
struct RowKey {
    hash: u64,
    flat: bool,
}

impl Stitcher {
    pub fn new(first: Frame) -> Self {
        let last = keys(&first);
        Self { image: first, last }
    }

    pub fn height(&self) -> usize {
        self.image.height
    }

    pub fn finish(self) -> Frame {
        self.image
    }

    pub fn push(&mut self, next: &Frame) -> Result<Step, String> {
        if next.width != self.image.width || next.height != self.last.len() {
            return Err("frame size changed during the scrolling capture".into());
        }
        if self.image.height >= MAX_HEIGHT {
            return Ok(Step::Full);
        }
        let next_keys = keys(next);
        let bands = fixed_bands(&self.last, &next_keys);
        let body = next.height - bands.header - bands.footer;
        if body < MIN_BODY_ROWS {
            return Ok(Step::Unchanged);
        }
        let Some(shift) = find_shift(&self.last, &next_keys, bands) else {
            return Ok(Step::Lost);
        };
        // The new rows start right below the overlap. At the height cap only
        // the first of them are kept, so the image stays continuous rather
        // than skipping to the newest rows.
        let bottom = next.height - bands.footer;
        let first = bottom - shift;
        let kept = shift.min(MAX_HEIGHT - self.image.height);
        self.insert_above_footer(next, first..first + kept, bands.footer);
        self.last = next_keys;
        Ok(Step::Appended(kept))
    }

    /// The image always ends with the last frame's bottom rows, so its last
    /// `footer` rows are the footer and the new rows go just above them.
    fn insert_above_footer(&mut self, next: &Frame, rows: std::ops::Range<usize>, footer: usize) {
        let stride = next.width * 4;
        let at = (self.image.height - footer) * stride;
        let new_rows = &next.rgba[rows.start * stride..rows.end * stride];
        self.image.rgba.splice(at..at, new_rows.iter().copied());
        self.image.height += rows.len();
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Bands {
    header: usize,
    footer: usize,
}

/// Rows equal at the same position in both frames, counted from the top and
/// from the bottom. The footer never overlaps the header.
fn fixed_bands(last: &[RowKey], next: &[RowKey]) -> Bands {
    let same = |i: usize| last[i].hash == next[i].hash;
    let height = next.len();
    let header = (0..height).take_while(|&i| same(i)).count();
    let footer = (header..height).rev().take_while(|&i| same(i)).count();
    Bands { header, footer }
}

/// The smallest upward scroll that lines the two frames up, if any. Smallest
/// first, because a repeating pattern also matches at larger shifts.
fn find_shift(last: &[RowKey], next: &[RowKey], bands: Bands) -> Option<usize> {
    let bottom = next.len() - bands.footer;
    (1..bottom - bands.header).find(|&shift| {
        let mut informative = 0;
        let mut matched = 0;
        for i in bands.header..bottom - shift {
            let old = last[i + shift];
            if old.flat {
                continue;
            }
            informative += 1;
            if old.hash == next[i].hash {
                matched += 1;
            }
        }
        informative >= MIN_INFORMATIVE_ROWS && matched as f64 >= informative as f64 * MATCH_RATIO
    })
}

fn keys(frame: &Frame) -> Vec<RowKey> {
    (0..frame.height)
        .map(|y| {
            let row = frame.row(y);
            RowKey {
                hash: fnv1a(row),
                flat: row
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .all(|pixel| pixel[..] == row[..4]),
            }
        })
        .collect()
}

/// FNV-1a, 64 bit. Not cryptographic; it only has to tell rows apart.
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, &byte| {
        (hash ^ byte as u64).wrapping_mul(0x0100_0000_01b3)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const WIDTH: usize = 4;

    /// A row whose pixels differ from each other and from every other row.
    fn row(seed: usize) -> Vec<u8> {
        (0..WIDTH)
            .flat_map(|x| {
                let v = (seed * 31 + x * 7) as u32;
                [(v % 251) as u8, (v / 251 % 251) as u8, x as u8, 255]
            })
            .collect()
    }

    fn frame(rows: &[Vec<u8>]) -> Frame {
        Frame {
            width: WIDTH,
            height: rows.len(),
            rgba: rows.concat(),
        }
    }

    /// A page of distinct rows, seen through a window `height` rows tall.
    fn page(len: usize) -> Vec<Vec<u8>> {
        (0..len).map(row).collect()
    }

    fn window(page: &[Vec<u8>], top: usize, height: usize) -> Frame {
        frame(&page[top..top + height])
    }

    #[test]
    fn scrolled_frames_join_into_the_page() {
        let page = page(300);
        let mut stitcher = Stitcher::new(window(&page, 0, 100));
        assert_eq!(
            stitcher.push(&window(&page, 30, 100)),
            Ok(Step::Appended(30))
        );
        assert_eq!(stitcher.push(&window(&page, 30, 100)), Ok(Step::Unchanged));
        assert_eq!(
            stitcher.push(&window(&page, 95, 100)),
            Ok(Step::Appended(65))
        );
        assert_eq!(stitcher.finish(), window(&page, 0, 195));
    }

    #[test]
    fn a_jump_past_the_window_is_lost() {
        let page = page(300);
        let mut stitcher = Stitcher::new(window(&page, 0, 100));
        assert_eq!(stitcher.push(&window(&page, 150, 100)), Ok(Step::Lost));
        assert_eq!(stitcher.height(), 100);
    }

    // A sticky header and footer stay once, at the top and bottom.
    #[test]
    fn fixed_header_and_footer_are_not_repeated() {
        let content = page(300);
        let header = vec![row(1000), row(1001)];
        let footer = vec![row(2000)];
        let view = |top: usize| {
            let mut rows = header.clone();
            rows.extend_from_slice(&content[top..top + 50]);
            rows.extend(footer.clone());
            frame(&rows)
        };
        let mut stitcher = Stitcher::new(view(0));
        assert_eq!(stitcher.push(&view(20)), Ok(Step::Appended(20)));
        assert_eq!(stitcher.push(&view(45)), Ok(Step::Appended(25)));

        let mut expected = header.clone();
        expected.extend_from_slice(&content[0..95]);
        expected.extend(footer);
        assert_eq!(stitcher.finish(), frame(&expected));
    }

    // Blank rows match at any shift, so they alone cannot line frames up.
    #[test]
    fn blank_content_does_not_count_as_overlap() {
        let blank = vec![vec![9u8; WIDTH * 4]; 100];
        let mut moved = blank.clone();
        moved[99] = row(5);
        let mut stitcher = Stitcher::new(frame(&blank));
        assert_eq!(stitcher.push(&frame(&moved)), Ok(Step::Unchanged));
    }

    // The rows kept at the cap continue the image, they do not jump ahead.
    #[test]
    fn the_height_cap_keeps_the_rows_that_follow() {
        let page = page(MAX_HEIGHT + 400);
        let mut stitcher = Stitcher::new(window(&page, 0, 100));
        let mut top = 0;
        while stitcher.height() < MAX_HEIGHT - 30 {
            top += 60;
            stitcher.push(&window(&page, top, 100)).unwrap();
        }
        let before = stitcher.height();
        let step = stitcher.push(&window(&page, top + 60, 100)).unwrap();
        assert_eq!(step, Step::Appended(MAX_HEIGHT - before));
        assert_eq!(stitcher.finish(), window(&page, 0, MAX_HEIGHT));
    }

    #[test]
    fn a_resized_frame_is_an_error() {
        let page = page(300);
        let mut stitcher = Stitcher::new(window(&page, 0, 100));
        assert!(stitcher.push(&window(&page, 0, 90)).is_err());
    }
}
