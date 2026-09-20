use super::super::common::px;
use super::xml::attr;
use super::SlideCtx;
use crate::Shape;
use quick_xml::events::Event;
use quick_xml::Reader;

struct Cell {
    shape: Shape,
    span: usize,
}

impl Cell {
    fn new() -> Self {
        Self {
            shape: Shape {
                kind: "rect".into(),
                stroke: "none".into(),
                fill: "none".into(),
                vertical_align: "center".into(),
                ..Shape::default()
            },
            span: 1,
        }
    }
}

pub(super) fn parse_table_frame(
    reader: &mut Reader<&[u8]>,
    ctx: &SlideCtx,
) -> Result<Vec<Shape>, String> {
    let mut stack: Vec<String> = vec!["graphicFrame".into()];
    let mut origin = (0i64, 0i64);
    let mut widths = Vec::new();
    let mut row_y = 0i64;
    let mut row_h = 0i64;
    let mut column = 0usize;
    let mut cell: Option<Cell> = None;
    let mut shapes = Vec::new();

    loop {
        let event = reader.read_event().map_err(|error| error.to_string())?;
        match event {
            Event::Start(ref element) | Event::Empty(ref element) => {
                let name = String::from_utf8_lossy(element.local_name().as_ref()).to_string();
                let empty = matches!(event, Event::Empty(_));
                match name.as_str() {
                    "off" if stack.last().map(String::as_str) == Some("xfrm") => {
                        origin.0 = number(element, b"x");
                        origin.1 = number(element, b"y");
                    }
                    "gridCol" if stack.last().map(String::as_str) == Some("tblGrid") => {
                        widths.push(number(element, b"w"));
                    }
                    "tr" if stack.last().map(String::as_str) == Some("tbl") => {
                        row_h = number(element, b"h");
                        column = 0;
                    }
                    "tc" if stack.last().map(String::as_str) == Some("tr") => {
                        let mut next = Cell::new();
                        next.span = number(element, b"gridSpan").max(1) as usize;
                        cell = Some(next);
                    }
                    _ => {}
                }
                if let Some(current) = cell.as_mut() {
                    read_cell_element(current, &name, element, &stack, ctx);
                }
                if !empty {
                    stack.push(name);
                }
            }
            Event::Text(ref text) => {
                if stack.last().map(String::as_str) == Some("t") {
                    if let Some(current) = cell.as_mut() {
                        current.shape.text.push_str(&text.decode().map_err(|error| error.to_string())?);
                    }
                }
            }
            Event::GeneralRef(ref reference) => {
                if stack.last().map(String::as_str) == Some("t") {
                    if let Some(current) = cell.as_mut() {
                        let value = match reference.as_ref() {
                            b"amp" => "&",
                            b"lt" => "<",
                            b"gt" => ">",
                            b"quot" => "\"",
                            b"apos" => "'",
                            _ => "",
                        };
                        current.shape.text.push_str(value);
                    }
                }
            }
            Event::End(ref element) => {
                let name = String::from_utf8_lossy(element.local_name().as_ref()).to_string();
                if name == "tc" {
                    if let Some(mut current) = cell.take() {
                        let x = origin.0 + widths.iter().take(column).sum::<i64>();
                        let width = widths.iter().skip(column).take(current.span).sum::<i64>();
                        current.shape.x = px(x);
                        current.shape.y = px(origin.1 + row_y);
                        current.shape.w = px(width);
                        current.shape.h = px(row_h);
                        shapes.push(current.shape);
                        column += current.span;
                    }
                } else if name == "tr" {
                    row_y += row_h;
                }
                stack.pop();
                if name == "graphicFrame" {
                    break;
                }
            }
            Event::Eof => return Err("incomplete table frame".into()),
            _ => {}
        }
    }
    Ok(shapes)
}

fn number(element: &quick_xml::events::BytesStart, name: &[u8]) -> i64 {
    attr(element, name)
        .and_then(|value| value.parse().ok())
        .unwrap_or(0)
}

fn read_cell_element(
    cell: &mut Cell,
    name: &str,
    element: &quick_xml::events::BytesStart,
    stack: &[String],
    ctx: &SlideCtx,
) {
    match name {
        "tcPr" => {
            cell.shape.vertical_align = match attr(element, b"anchor").as_deref() {
                Some("b") => "bottom",
                Some("ctr") => "center",
                _ => "top",
            }.into();
        }
        "pPr" => {
            cell.shape.text_align = match attr(element, b"algn").as_deref() {
                Some("r") => "right",
                Some("ctr") => "center",
                _ => "left",
            }.into();
        }
        "rPr" => {
            if let Some(size) = attr(element, b"sz").and_then(|value| value.parse::<f64>().ok()) {
                cell.shape.font_size = (size / 100.0 * 1.3333 * 10.0).round() / 10.0;
            }
            cell.shape.bold = attr(element, b"b").as_deref() == Some("1");
        }
        "latin" if stack.iter().any(|item| item == "rPr") => {
            if let Some(family) = attr(element, b"typeface") {
                cell.shape.font_family = family;
            }
        }
        "srgbClr" | "schemeClr" => {
            let color = if name == "srgbClr" {
                attr(element, b"val").map(|value| format!("#{}", value.to_lowercase()))
            } else {
                attr(element, b"val").and_then(|value| ctx.scheme_hex(&value))
            };
            if let Some(color) = color {
                if stack.iter().any(|item| item == "rPr") {
                    cell.shape.text_color = color;
                } else if stack.iter().any(|item| item == "tcPr") {
                    if stack.iter().any(|item| item.starts_with("ln")) {
                        cell.shape.stroke = color;
                    } else {
                        cell.shape.fill = color;
                    }
                }
            }
        }
        "lnL" if stack.last().map(String::as_str) == Some("tcPr") => {
            cell.shape.stroke_width = px(number(element, b"w"));
        }
        _ => {}
    }
}
