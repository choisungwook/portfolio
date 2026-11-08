//! Visual items on the timeline

use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualTransform {
    /// Project pixels, independent of the monitor's display scale.
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    /// Clockwise degrees around the item's centre.
    pub rotation: f32,
    #[serde(default = "one")]
    pub opacity: f32,
}

pub(super) fn default_font_family() -> String {
    "sans-serif".into()
}

pub(super) fn default_font_size() -> f32 {
    64.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

impl Default for TextAlign {
    fn default() -> Self {
        TextAlign::Center
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Crop {
    #[serde(default)]
    pub left: f32,
    #[serde(default)]
    pub top: f32,
    #[serde(default)]
    pub right: f32,
    #[serde(default)]
    pub bottom: f32,
}

impl Crop {
    pub fn is_valid(self) -> bool {
        [self.left, self.top, self.right, self.bottom]
            .into_iter()
            .all(|value| value.is_finite() && (0.0..1.0).contains(&value))
            && self.left + self.right < 1.0
            && self.top + self.bottom < 1.0
    }

    pub fn is_empty(self) -> bool {
        self == Crop::default()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextStyle {
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    #[serde(default)]
    pub align: TextAlign,
    #[serde(flatten)]
    pub visual_style: VisualStyle,
}

impl Default for TextStyle {
    fn default() -> Self {
        TextStyle {
            font_family: default_font_family(),
            font_size: default_font_size(),
            align: TextAlign::default(),
            visual_style: default_text_visual_style(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaintPoint {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GradientStop {
    pub position: f32,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Paint {
    Solid {
        color: String,
    },
    LinearGradient {
        #[serde(default = "default_linear_start")]
        start: PaintPoint,
        #[serde(default = "default_linear_end")]
        end: PaintPoint,
        #[serde(default = "default_gradient_stops")]
        stops: Vec<GradientStop>,
    },
    RadialGradient {
        #[serde(default = "default_radial_center")]
        center: PaintPoint,
        #[serde(default = "default_radial_radius")]
        radius: f32,
        #[serde(default = "default_gradient_stops")]
        stops: Vec<GradientStop>,
    },
    Image {
        asset_id: String,
    },
    Video {
        asset_id: String,
    },
}

impl Paint {
    pub fn solid(color: impl Into<String>) -> Paint {
        Paint::Solid {
            color: color.into(),
        }
    }

    pub fn asset_id(&self) -> Option<&str> {
        match self {
            Paint::Image { asset_id } | Paint::Video { asset_id } => Some(asset_id),
            Paint::Solid { .. } | Paint::LinearGradient { .. } | Paint::RadialGradient { .. } => {
                None
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stroke {
    pub color: String,
    #[serde(default)]
    pub width: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shadow {
    pub color: String,
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default)]
    pub blur: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VisualStyle {
    #[serde(default)]
    pub fills: Vec<Paint>,
    #[serde(default)]
    pub stroke: Option<Stroke>,
    #[serde(default)]
    pub shadow: Option<Shadow>,
}

impl VisualStyle {
    pub fn shape_default() -> VisualStyle {
        VisualStyle {
            fills: vec![Paint::solid("#4f8cffcc")],
            stroke: Some(Stroke {
                color: "#ffffff".into(),
                width: 4.0,
            }),
            shadow: None,
        }
    }

    pub(super) fn validate(&self) -> Result<(), &'static str> {
        if self.fills.is_empty() {
            return Err("has no fills");
        }
        for paint in &self.fills {
            match paint {
                Paint::LinearGradient { start, end, stops } => {
                    if ![start.x, start.y, end.x, end.y]
                        .into_iter()
                        .all(f32::is_finite)
                    {
                        return Err("has a non-finite linear gradient");
                    }
                    validate_stops(stops)?;
                }
                Paint::RadialGradient {
                    center,
                    radius,
                    stops,
                } => {
                    if ![center.x, center.y, *radius]
                        .into_iter()
                        .all(f32::is_finite)
                        || *radius <= 0.0
                    {
                        return Err("has an invalid radial gradient");
                    }
                    validate_stops(stops)?;
                }
                Paint::Image { asset_id } | Paint::Video { asset_id } if asset_id.is_empty() => {
                    return Err("has a paint without an asset")
                }
                Paint::Solid { .. } | Paint::Image { .. } | Paint::Video { .. } => {}
            }
        }
        if self
            .stroke
            .as_ref()
            .is_some_and(|stroke| !stroke.width.is_finite() || stroke.width < 0.0)
        {
            return Err("has an invalid stroke");
        }
        if self.shadow.as_ref().is_some_and(|shadow| {
            ![shadow.x, shadow.y, shadow.blur]
                .into_iter()
                .all(f32::is_finite)
                || shadow.blur < 0.0
        }) {
            return Err("has an invalid shadow");
        }
        Ok(())
    }
}

pub(super) fn validate_stops(stops: &[GradientStop]) -> Result<(), &'static str> {
    if stops.is_empty()
        || stops
            .iter()
            .any(|stop| !stop.position.is_finite() || !(0.0..=1.0).contains(&stop.position))
    {
        return Err("has invalid gradient stops");
    }
    Ok(())
}

pub(super) fn default_linear_start() -> PaintPoint {
    PaintPoint { x: 0.0, y: 0.5 }
}

pub(super) fn default_linear_end() -> PaintPoint {
    PaintPoint { x: 1.0, y: 0.5 }
}

pub(super) fn default_radial_center() -> PaintPoint {
    PaintPoint { x: 0.5, y: 0.5 }
}

pub(super) fn default_radial_radius() -> f32 {
    0.5
}

pub(super) fn default_gradient_stops() -> Vec<GradientStop> {
    vec![
        GradientStop {
            position: 0.0,
            color: "#ffffff".into(),
        },
        GradientStop {
            position: 1.0,
            color: "#000000".into(),
        },
    ]
}

pub(super) fn default_text_visual_style() -> VisualStyle {
    VisualStyle {
        fills: vec![Paint::solid("#ffffff")],
        stroke: None,
        shadow: Some(Shadow {
            color: "#00000080".into(),
            x: 2.0,
            y: 2.0,
            blur: 0.0,
        }),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WireTextStyle {
    #[serde(default = "default_font_family")]
    font_family: String,
    #[serde(default = "default_font_size")]
    font_size: f32,
    #[serde(default)]
    align: TextAlign,
    fills: Option<Vec<Paint>>,
    stroke: Option<Stroke>,
    shadow: Option<Shadow>,
    color: Option<String>,
    stroke_color: Option<String>,
    stroke_width: Option<f32>,
    shadow_color: Option<String>,
    shadow_x: Option<f32>,
    shadow_y: Option<f32>,
}

impl<'de> Deserialize<'de> for TextStyle {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let wire = WireTextStyle::deserialize(deserializer)?;
        let visual_style = if let Some(fills) = wire.fills {
            VisualStyle {
                fills,
                stroke: wire.stroke,
                shadow: wire.shadow,
            }
        } else {
            VisualStyle {
                fills: vec![Paint::solid(wire.color.unwrap_or_else(|| "#ffffff".into()))],
                stroke: wire
                    .stroke_width
                    .filter(|width| *width > 0.0)
                    .map(|width| Stroke {
                        color: wire.stroke_color.unwrap_or_else(|| "#000000".into()),
                        width,
                    }),
                shadow: wire.shadow_color.and_then(|color| {
                    (!color.is_empty()).then_some(Shadow {
                        color,
                        x: wire.shadow_x.unwrap_or(2.0),
                        y: wire.shadow_y.unwrap_or(2.0),
                        blur: 0.0,
                    })
                }),
            }
        };
        Ok(TextStyle {
            font_family: wire.font_family,
            font_size: wire.font_size,
            align: wire.align,
            visual_style,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum VisualContent {
    Text {
        text: String,
        #[serde(default)]
        style: TextStyle,
    },
    Shape {
        #[serde(default)]
        shape: ShapeKind,
        #[serde(flatten)]
        visual_style: VisualStyle,
        #[serde(default)]
        corner_radius: f32,
        #[serde(default)]
        start_arrow: bool,
        #[serde(default)]
        end_arrow: bool,
    },
    Image {
        asset_id: String,
    },
    VideoOverlay {
        asset_id: String,
        #[serde(default)]
        in_point: i64,
        #[serde(default)]
        crop: Crop,
        #[serde(default)]
        corner_radius: f32,
        #[serde(default)]
        border: Option<Stroke>,
        #[serde(default)]
        audio_enabled: bool,
    },
    Adjustment {
        lut_path: String,
    },
}

impl VisualContent {
    pub fn asset_id(&self) -> Option<&str> {
        match self {
            VisualContent::Image { asset_id } | VisualContent::VideoOverlay { asset_id, .. } => {
                Some(asset_id)
            }
            VisualContent::Text { .. }
            | VisualContent::Shape { .. }
            | VisualContent::Adjustment { .. } => None,
        }
    }

    pub fn references_asset(&self, wanted: &str) -> bool {
        if self.asset_id() == Some(wanted) {
            return true;
        }
        let style = match self {
            VisualContent::Text { style, .. } => Some(&style.visual_style),
            VisualContent::Shape { visual_style, .. } => Some(visual_style),
            VisualContent::Image { .. }
            | VisualContent::VideoOverlay { .. }
            | VisualContent::Adjustment { .. } => None,
        };
        style.is_some_and(|style| {
            style
                .fills
                .iter()
                .any(|paint| paint.asset_id() == Some(wanted))
        })
    }

    pub fn uses_video_paint(&self) -> bool {
        if matches!(self, VisualContent::VideoOverlay { .. }) {
            return true;
        }
        let style = match self {
            VisualContent::Text { style, .. } => Some(&style.visual_style),
            VisualContent::Shape { visual_style, .. } => Some(visual_style),
            VisualContent::Adjustment { .. } => return true,
            VisualContent::Image { .. } | VisualContent::VideoOverlay { .. } => None,
        };
        style.is_some_and(|style| {
            style
                .fills
                .iter()
                .any(|paint| matches!(paint, Paint::Video { .. }))
        })
    }
}

/// The primitive drawn inside a shape item's shared transform rectangle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ShapeKind {
    Rectangle,
    RoundedRectangle,
    Ellipse,
    Line,
    Polygon,
    Star,
}

impl Default for ShapeKind {
    fn default() -> Self {
        ShapeKind::Rectangle
    }
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum WireVisualContent {
    Text {
        text: String,
        #[serde(default)]
        style: TextStyle,
    },
    Shape {
        #[serde(default)]
        shape: ShapeKind,
        fills: Option<Vec<Paint>>,
        shadow: Option<Shadow>,
        fill: Option<String>,
        stroke: Option<WireStroke>,
        stroke_width: Option<f32>,
        #[serde(default)]
        corner_radius: f32,
        #[serde(default)]
        start_arrow: bool,
        #[serde(default)]
        end_arrow: bool,
    },
    Image {
        asset_id: String,
    },
    VideoOverlay {
        asset_id: String,
        #[serde(default)]
        in_point: i64,
        #[serde(default)]
        crop: Crop,
        #[serde(default)]
        corner_radius: f32,
        #[serde(default)]
        border: Option<Stroke>,
        #[serde(default)]
        audio_enabled: bool,
    },
    Adjustment {
        lut_path: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub(super) enum WireStroke {
    Legacy(String),
    Current(Stroke),
}

impl<'de> Deserialize<'de> for VisualContent {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        match WireVisualContent::deserialize(deserializer)? {
            WireVisualContent::Text { text, style } => Ok(VisualContent::Text { text, style }),
            WireVisualContent::Shape {
                shape,
                fills,
                shadow,
                fill,
                stroke,
                stroke_width,
                corner_radius,
                start_arrow,
                end_arrow,
            } => {
                let legacy = fills.is_none();
                let visual_style = if let Some(fills) = fills {
                    VisualStyle {
                        fills,
                        stroke: stroke.and_then(|value| match value {
                            WireStroke::Current(stroke) => Some(stroke),
                            WireStroke::Legacy(_) => None,
                        }),
                        shadow,
                    }
                } else {
                    let width = stroke_width.unwrap_or(4.0);
                    VisualStyle {
                        fills: vec![Paint::solid(fill.unwrap_or_else(|| "#4f8cffcc".into()))],
                        stroke: (width > 0.0).then(|| Stroke {
                            color: stroke
                                .and_then(|value| match value {
                                    WireStroke::Legacy(color) => Some(color),
                                    WireStroke::Current(_) => None,
                                })
                                .unwrap_or_else(|| "#ffffff".into()),
                            width,
                        }),
                        shadow: None,
                    }
                };
                let shape = if legacy && shape == ShapeKind::Rectangle && corner_radius > 0.0 {
                    ShapeKind::RoundedRectangle
                } else {
                    shape
                };
                Ok(VisualContent::Shape {
                    shape,
                    visual_style,
                    corner_radius,
                    start_arrow,
                    end_arrow,
                })
            }
            WireVisualContent::Image { asset_id } => Ok(VisualContent::Image { asset_id }),
            WireVisualContent::VideoOverlay {
                asset_id,
                in_point,
                crop,
                corner_radius,
                border,
                audio_enabled,
            } => Ok(VisualContent::VideoOverlay {
                asset_id,
                in_point,
                crop,
                corner_radius,
                border,
                audio_enabled,
            }),
            WireVisualContent::Adjustment { lut_path } => {
                Ok(VisualContent::Adjustment { lut_path })
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualItem {
    pub id: String,
    /// Frame indexes on the project rate, like clip times.
    pub start: i64,
    pub duration: i64,
    pub transform: VisualTransform,
    #[serde(default)]
    pub animation: VisualAnimation,
    #[serde(default)]
    pub blend_mode: BlendMode,
    /// Higher values draw later within the track. Track array order remains
    /// the primary layer order.
    pub z_index: i32,
    pub content: VisualContent,
}

impl VisualItem {
    pub fn end_frame(&self) -> i64 {
        self.start.saturating_add(self.duration.max(0))
    }

    pub fn contains_frame(&self, frame: i64) -> bool {
        self.start <= frame && frame < self.end_frame()
    }

    pub fn transform_at(&self, frame: i64) -> VisualTransform {
        VisualTransform {
            x: self.animation.x.value_at(frame, self.transform.x),
            y: self.animation.y.value_at(frame, self.transform.y),
            width: self.animation.width.value_at(frame, self.transform.width),
            height: self.animation.height.value_at(frame, self.transform.height),
            rotation: self
                .animation
                .rotation
                .value_at(frame, self.transform.rotation),
            opacity: self
                .animation
                .opacity
                .value_at(frame, self.transform.opacity),
        }
    }
}
