use super::*;
use makevideo_render::{
    Paint, Project, ProjectSettings, Rate, ShapeKind as Shape, Stroke, Track, TrackKind,
    VisualContent as Content, VisualItem, VisualStyle, VisualTransform, FORMAT_VERSION,
};

fn shape_style(fill: &str, stroke: &str, width: f32) -> VisualStyle {
    VisualStyle {
        fills: vec![Paint::solid(fill)],
        stroke: (width > 0.0).then(|| Stroke {
            color: stroke.into(),
            width,
        }),
        shadow: None,
    }
}

fn project_with_shape() -> Project {
    Project {
        version: FORMAT_VERSION,
        settings: ProjectSettings {
            width: 100,
            height: 50,
            rate: Rate::fps(30),
        },
        assets: Vec::new(),
        markers: Vec::new(),
        transitions: Vec::new(),
        tracks: vec![Track {
            id: "V1".into(),
            kind: TrackKind::Video,
            name: "V1".into(),
            clips: Vec::new(),
            visual_items: vec![VisualItem {
                id: "s1".into(),
                start: 30,
                duration: 60,
                z_index: 0,
                transform: VisualTransform {
                    x: 10.0,
                    y: 5.0,
                    width: 40.0,
                    height: 20.0,
                    rotation: 0.0,
                    opacity: 0.8,
                },
                animation: Default::default(),
                blend_mode: Default::default(),
                content: Content::Shape {
                    shape: Shape::Rectangle,
                    visual_style: shape_style("#ff0000", "#ffffff", 1.0),
                    corner_radius: 0.0,
                    start_arrow: false,
                    end_arrow: false,
                },
            }],
            subtitle_style: None,
            muted: false,
            hidden: false,
        }],
    }
}

/// One raster per item, scaled to the output, carrying its frame range —
/// what the filter-graph render overlays. The same walk answers
/// `layers_at`, so the per-frame and per-item views cannot disagree.
#[test]
fn an_item_rasterizes_once_with_its_place_and_frames() {
    let project = project_with_shape();
    let rasters = item_rasters(&project, 200, 100);
    assert_eq!(rasters.len(), 1);
    let raster = &rasters[0];
    assert_eq!((raster.x, raster.y), (20, 10));
    assert_eq!((raster.width, raster.height), (80, 40));
    assert_eq!((raster.start_frame, raster.end_frame), (30, 90));
    assert!((raster.opacity - 0.8).abs() < 1e-6);
    assert_eq!(layers_at(&project, 30, 200, 100).len(), 1);
    assert_eq!(layers_at(&project, 90, 200, 100).len(), 0);
}

#[test]
fn a_pam_still_is_the_header_and_the_raw_bytes() {
    let dir = std::env::temp_dir().join(format!("makevideo-pam-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("still.pam");
    write_pam(&path, &[1, 2, 3, 4, 5, 6, 7, 8], 2, 1).unwrap();
    let bytes = std::fs::read(&path).unwrap();
    let header = b"P7\nWIDTH 2\nHEIGHT 1\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n";
    assert_eq!(&bytes[..header.len()], header);
    assert_eq!(&bytes[header.len()..], &[1, 2, 3, 4, 5, 6, 7, 8]);
    let _ = std::fs::remove_dir_all(&dir);
}

/// The outline is a band **inside** the edge, half the stroke width wide.
/// The page's playback overlay draws the same rim by clipping a stroke of
/// the full width to the shape, and the two only match while this holds.
#[test]
fn a_shape_outline_is_a_band_half_the_stroke_width_inside_the_edge() {
    let width = 40;
    let pixels = rasterize_shape(
        ShapeKind::Rectangle,
        &shape_style("#00000000", "#ff0000", 8.0),
        &[],
        1.0,
        0.0,
        false,
        false,
        width,
        20,
    );
    let opaque_at = |x: u32| pixels[((10 * width + x) * 4 + 3) as usize] > 0;
    assert!(opaque_at(0), "the edge itself is outlined");
    assert!(opaque_at(3), "3px in is still inside a 4px rim");
    assert!(
        !opaque_at(5),
        "5px in is past it, and the fill is transparent"
    );
}

#[test]
fn colour_accepts_css_hex_with_alpha() {
    assert_eq!(colour("#11223344", [0; 4]), [0x11, 0x22, 0x33, 0x44]);
}

#[test]
fn shapes_rasterize_fill_outline_and_line_arrows() {
    let rectangle = rasterize_shape(
        ShapeKind::Rectangle,
        &shape_style("#112233", "#ffffff", 2.0),
        &[],
        1.0,
        4.0,
        false,
        false,
        20,
        12,
    );
    assert_eq!(
        &rectangle[(6 * 20 + 10) * 4..(6 * 20 + 10) * 4 + 4],
        &[0x11, 0x22, 0x33, 255]
    );
    assert_eq!(&rectangle[(10) * 4..(10) * 4 + 4], &[255, 255, 255, 255]);

    let line = rasterize_shape(
        ShapeKind::Line,
        &shape_style("#00000000", "#ff0000", 3.0),
        &[],
        1.0,
        0.0,
        true,
        true,
        30,
        12,
    );
    assert_eq!(&line[(6 * 30) * 4..(6 * 30) * 4 + 4], &[255, 0, 0, 255]);
    assert_eq!(
        &line[(6 * 30 + 29) * 4..(6 * 30 + 29) * 4 + 4],
        &[255, 0, 0, 255]
    );

    let no_stroke = rasterize_shape(
        ShapeKind::Line,
        &shape_style("#00000000", "#ff0000", 0.0),
        &[],
        1.0,
        0.0,
        true,
        true,
        30,
        12,
    );
    assert!(no_stroke.chunks_exact(4).all(|pixel| pixel[3] == 0));
}

#[test]
fn gradients_interpolate_and_multiple_fills_stack_bottom_to_top() {
    let gradient = Paint::LinearGradient {
        start: makevideo_render::PaintPoint { x: 0.0, y: 0.5 },
        end: makevideo_render::PaintPoint { x: 1.0, y: 0.5 },
        stops: vec![
            GradientStop {
                position: 0.0,
                color: "#ff0000".into(),
            },
            GradientStop {
                position: 1.0,
                color: "#0000ff".into(),
            },
        ],
    };
    assert_eq!(
        sample_paint(&gradient, None, 0.0, 5.0, 10, 10),
        [255, 0, 0, 255]
    );
    let middle = sample_paint(&gradient, None, 5.0, 5.0, 10, 10);
    assert!(
        (middle[0] as i16 - middle[2] as i16).abs() <= 1,
        "{middle:?}"
    );

    let paints = [Paint::solid("#ff0000"), Paint::solid("#0000ff80")];
    let stacked = paint_stack(&paints, &[], 5.0, 5.0, 10, 10);
    assert!(stacked[0] >= 126 && stacked[0] <= 128, "{stacked:?}");
    assert!(stacked[2] >= 127 && stacked[2] <= 129, "{stacked:?}");
    assert_eq!(stacked[3], 255);
}

#[test]
fn polygon_star_and_rounded_rectangle_have_distinct_geometry() {
    let style = shape_style("#ffffff", "#000000", 0.0);
    for shape in [
        ShapeKind::Polygon,
        ShapeKind::Star,
        ShapeKind::RoundedRectangle,
    ] {
        let pixels = rasterize_shape(shape, &style, &[], 1.0, 5.0, false, false, 30, 30);
        assert_eq!(
            &pixels[(15 * 30 + 15) * 4..(15 * 30 + 15) * 4 + 4],
            &[255; 4]
        );
        assert_eq!(pixels[3], 0, "{shape:?} keeps its corner transparent");
    }
}

#[test]
fn a_media_paint_samples_the_decoded_rgba_frame() {
    let paint = Paint::Image {
        asset_id: "image".into(),
    };
    let pixels = [
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ];
    assert_eq!(
        sample_paint(&paint, Some(&pixels), 1.5, 0.5, 2, 2),
        [0, 255, 0, 255]
    );
    assert_eq!(
        sample_paint(&paint, Some(&pixels), 0.5, 1.5, 2, 2),
        [0, 0, 255, 255]
    );
}
