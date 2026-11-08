//! The screen region a scrolling capture repeats, and where its windows go.

use crate::layout::Rect;

/// A region smaller than this either way is a stray click, not a selection.
pub const MIN_SIZE: f64 = 40.0;
/// Gap between the region and the dashed frame drawn around it. The frame sits
/// outside so it never lands in a captured frame.
pub const FRAME_GAP: f64 = 3.0;
pub const PANEL_WIDTH: f64 = 300.0;
pub const PANEL_HEIGHT: f64 = 52.0;
const PANEL_MARGIN: f64 = 10.0;

/// Whole points with a positive size, or None for a selection too small to be
/// one. The page measures in fractional CSS pixels and screencapture takes
/// integers.
pub fn normalize(region: Rect) -> Option<Rect> {
    let rect = Rect {
        x: region.x.round(),
        y: region.y.round(),
        width: region.width.round(),
        height: region.height.round(),
    };
    let finite = [rect.x, rect.y, rect.width, rect.height]
        .iter()
        .all(|v| v.is_finite());
    (finite && rect.width >= MIN_SIZE && rect.height >= MIN_SIZE).then_some(rect)
}

/// screencapture flags for one silent frame of the region, in global points.
pub fn capture_args(region: Rect) -> Vec<String> {
    vec![
        "-x".into(),
        format!(
            "-R{},{},{},{}",
            region.x, region.y, region.width, region.height
        ),
    ]
}

/// The frame window: the region grown by the gap on every side.
pub fn frame_rect(region: Rect) -> Rect {
    Rect {
        x: region.x - FRAME_GAP,
        y: region.y - FRAME_GAP,
        width: region.width + FRAME_GAP * 2.0,
        height: region.height + FRAME_GAP * 2.0,
    }
}

/// Top-left of the Done/Cancel panel: centred below the region, above it when
/// there is no room below, and inside the bottom edge as a last resort. It
/// must stay out of the region, or it would be captured into every frame.
pub fn panel_position(region: Rect, screen: Rect) -> (f64, f64) {
    let centred = region.x + (region.width - PANEL_WIDTH) / 2.0;
    let x = centred.clamp(screen.x, screen.x + screen.width - PANEL_WIDTH);
    let below = region.y + region.height + FRAME_GAP + PANEL_MARGIN;
    let above = region.y - FRAME_GAP - PANEL_MARGIN - PANEL_HEIGHT;
    let y = if below + PANEL_HEIGHT <= screen.y + screen.height {
        below
    } else if above >= screen.y {
        above
    } else {
        screen.y + screen.height - PANEL_HEIGHT - PANEL_MARGIN
    };
    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Rect = Rect {
        x: 0.0,
        y: 0.0,
        width: 1440.0,
        height: 900.0,
    };

    fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn normalize_rounds_and_rejects_small_or_broken() {
        assert_eq!(
            normalize(rect(10.4, 20.6, 300.5, 200.2)),
            Some(rect(10.0, 21.0, 301.0, 200.0))
        );
        assert_eq!(normalize(rect(0.0, 0.0, 39.0, 500.0)), None);
        assert_eq!(normalize(rect(f64::NAN, 0.0, 100.0, 100.0)), None);
    }

    #[test]
    fn capture_args_name_the_region() {
        assert_eq!(
            capture_args(rect(10.0, 20.0, 300.0, 200.0)),
            vec!["-x", "-R10,20,300,200"]
        );
    }

    #[test]
    fn frame_surrounds_the_region() {
        assert_eq!(
            frame_rect(rect(10.0, 20.0, 100.0, 50.0)),
            rect(7.0, 17.0, 106.0, 56.0)
        );
    }

    #[test]
    fn panel_goes_below_then_above_then_inside() {
        assert_eq!(
            panel_position(rect(100.0, 100.0, 400.0, 300.0), SCREEN),
            (150.0, 413.0)
        );
        assert_eq!(
            panel_position(rect(100.0, 500.0, 400.0, 380.0), SCREEN),
            (150.0, 435.0)
        );
        assert_eq!(
            panel_position(rect(0.0, 0.0, 200.0, 900.0), SCREEN),
            (0.0, 838.0)
        );
    }
}
