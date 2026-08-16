//! The deck model shared with the page as JSON, plus pptx and pdf writers.
//!
//! Coordinates are pixels. pptx uses 9525 EMU per pixel, so custom pixel and
//! centimetre dimensions share one conversion without changing shape units.

use serde::{Deserialize, Serialize};

pub mod pdf;
pub mod pptx;

pub const SLIDE_W: f64 = 1920.0;
pub const SLIDE_H: f64 = 1080.0;
pub const EMU_PER_PX: f64 = 9525.0;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Deck {
    #[serde(default = "default_slide_width")]
    pub slide_width: f64,
    #[serde(default = "default_slide_height")]
    pub slide_height: f64,
    pub slides: Vec<Slide>,
}

pub fn default_slide_width() -> f64 {
    SLIDE_W
}

pub fn default_slide_height() -> f64 {
    SLIDE_H
}

impl Default for Deck {
    fn default() -> Self {
        Deck {
            slide_width: SLIDE_W,
            slide_height: SLIDE_H,
            slides: Vec::new(),
        }
    }
}

/// One slide: its own background color plus the shapes drawn on it. The
/// background is a field rather than a page-sized rect so recoloring it
/// cannot touch a shape, and so it can never be selected or dragged.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Slide {
    pub shapes: Vec<Shape>,
    #[serde(default = "default_background")]
    pub background: String,
}

impl Default for Slide {
    fn default() -> Self {
        Slide {
            shapes: Vec::new(),
            background: default_background(),
        }
    }
}

pub fn default_background() -> String {
    "#ffffff".into()
}

/// One drawable thing. `kind` is rect | ellipse | line | arrow | pen | text | image | code.
///
/// rect/ellipse/text use x,y,w,h. line/arrow run from (x,y) to (x+w,y+h), so
/// w and h may be negative. pen keeps absolute points and ignores x,y,w,h.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Shape {
    pub kind: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub w: f64,
    #[serde(default)]
    pub h: f64,
    #[serde(default)]
    pub points: Vec<[f64; 2]>,
    #[serde(default = "default_stroke")]
    pub stroke: String,
    #[serde(default = "default_stroke_width")]
    pub stroke_width: f64,
    /// solid | dash | dot
    #[serde(default = "default_dash")]
    pub dash: String,
    /// "none" or "#rrggbb"
    #[serde(default = "default_none")]
    pub fill: String,
    #[serde(default)]
    pub text: String,
    #[serde(default = "default_font_size")]
    pub font_size: f64,
    #[serde(default = "default_text_color")]
    pub text_color: String,
    /// One family name, not a CSS stack, so it maps straight onto the pptx
    /// `a:latin` typeface.
    #[serde(default = "default_font_family")]
    pub font_family: String,
    /// Data URL of the picture bytes; only for kind "image".
    #[serde(default)]
    pub src: String,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub underline: bool,
    #[serde(default = "default_text_align")]
    pub text_align: String,
    #[serde(default = "default_vertical_align")]
    pub vertical_align: String,
    #[serde(default)]
    pub crop_left: f64,
    #[serde(default)]
    pub crop_top: f64,
    #[serde(default)]
    pub crop_right: f64,
    #[serde(default)]
    pub crop_bottom: f64,
    #[serde(default)]
    pub rotation: f64,
    /// One of none | triangle | arrow | oval | diamond, which are the pptx
    /// `a:headEnd`/`a:tailEnd` type names, so a round trip is a rename.
    #[serde(default = "default_arrow_end")]
    pub arrow_start: String,
    #[serde(default = "default_arrow_end")]
    pub arrow_end: String,
    #[serde(default)]
    pub group_id: String,
    #[serde(default = "default_code_format")]
    pub code_format: String,
    #[serde(default = "default_code_language")]
    pub code_language: String,
    #[serde(default)]
    pub code_highlights: Vec<u32>,
    #[serde(default)]
    pub code_callouts: Vec<u32>,
    #[serde(default = "default_true")]
    pub show_line_numbers: bool,
}

pub fn default_arrow_end() -> String {
    "none".into()
}

fn default_stroke() -> String {
    "#e03131".into()
}
fn default_stroke_width() -> f64 {
    2.0
}
fn default_dash() -> String {
    "solid".into()
}
fn default_none() -> String {
    "none".into()
}
fn default_font_size() -> f64 {
    24.0
}
fn default_text_color() -> String {
    "#1a1a1a".into()
}
fn default_font_family() -> String {
    "Helvetica".into()
}

fn default_text_align() -> String {
    "left".into()
}

fn default_vertical_align() -> String {
    "top".into()
}

fn default_code_format() -> String {
    "editor-dark".into()
}

fn default_code_language() -> String {
    "python".into()
}

fn default_true() -> bool {
    true
}

impl Default for Shape {
    fn default() -> Self {
        Shape {
            kind: "rect".into(),
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            points: Vec::new(),
            stroke: default_stroke(),
            stroke_width: default_stroke_width(),
            dash: default_dash(),
            fill: default_none(),
            text: String::new(),
            font_size: default_font_size(),
            text_color: default_text_color(),
            font_family: default_font_family(),
            src: String::new(),
            bold: false,
            italic: false,
            underline: false,
            text_align: default_text_align(),
            vertical_align: default_vertical_align(),
            crop_left: 0.0,
            crop_top: 0.0,
            crop_right: 0.0,
            crop_bottom: 0.0,
            rotation: 0.0,
            arrow_start: default_arrow_end(),
            arrow_end: default_arrow_end(),
            group_id: String::new(),
            code_format: default_code_format(),
            code_language: default_code_language(),
            code_highlights: Vec::new(),
            code_callouts: Vec::new(),
            show_line_numbers: true,
        }
    }
}
