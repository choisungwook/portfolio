/// A rectangle in logical points, the unit windows are placed in.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub const PREVIEW_WIDTH: f64 = 280.0;
pub const PREVIEW_HEIGHT: f64 = 200.0;
const PREVIEW_MARGIN: f64 = 20.0;
const PREVIEW_GAP: f64 = 12.0;

/// Toolbar and padding around the editor canvas, in points.
const EDITOR_CHROME_WIDTH: f64 = 32.0;
const EDITOR_CHROME_HEIGHT: f64 = 92.0;

/// The toolbar does not fit below this, so a small screenshot still gets a wide
/// window: ten icon tools plus four action buttons sit on one row from 800 up,
/// and 860 leaves room for a longer label.
const EDITOR_MIN_WIDTH: f64 = 860.0;

/// Top-left corner of the nth preview, stacking upward from the bottom left.
pub fn preview_position(work_area: Rect, index: usize) -> (f64, f64) {
    let step = index as f64 * (PREVIEW_HEIGHT + PREVIEW_GAP);
    (
        work_area.x + PREVIEW_MARGIN,
        work_area.y + work_area.height - PREVIEW_MARGIN - PREVIEW_HEIGHT - step,
    )
}

/// Inner size of the editor window. The png is in device pixels, so on a retina
/// display it is twice the points the window is measured in; without the divide
/// a normal selection opens a window larger than the screen.
pub fn editor_window_size(image: (u32, u32), work_area: Rect, scale: f64) -> (f64, f64) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let width = (image.0 as f64 / scale).round() + EDITOR_CHROME_WIDTH;
    let height = (image.1 as f64 / scale).round() + EDITOR_CHROME_HEIGHT;
    (
        width.max(EDITOR_MIN_WIDTH).min(work_area.width),
        height.min(work_area.height),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const AREA: Rect = Rect {
        x: 0.0,
        y: 25.0,
        width: 1440.0,
        height: 875.0,
    };

    #[test]
    fn previews_stack_upward_from_bottom_left() {
        assert_eq!(preview_position(AREA, 0), (20.0, 680.0));
        assert_eq!(preview_position(AREA, 1), (20.0, 468.0));
    }

    #[test]
    fn editor_size_divides_by_scale_and_clamps() {
        assert_eq!(editor_window_size((2000, 1000), AREA, 2.0), (1032.0, 592.0));
        // A tiny capture still gets room for the toolbar.
        assert_eq!(editor_window_size((100, 100), AREA, 2.0), (860.0, 142.0));
        // A full-screen capture never exceeds the work area.
        assert_eq!(editor_window_size((2880, 1800), AREA, 2.0), (1440.0, 875.0));
        assert_eq!(editor_window_size((100, 100), AREA, 0.0), (860.0, 192.0));
    }
}
