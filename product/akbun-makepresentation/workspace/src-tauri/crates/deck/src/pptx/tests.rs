use super::common::{mime_for_ext, IMAGE_FORMATS};
use super::read::{parse_background, parse_part, parse_sld_sz, part, SlideCtx};
use super::write::{content_types, decode_data_url};
use super::{read::read, write::write};
use crate::{Deck, Shape, Slide, EMU_PER_PX};
use base64::Engine;
use std::collections::HashMap;
use std::io::{Cursor, Write};

    // A 1x1 red PNG.
    const TINY_PNG: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    fn sample_deck() -> Deck {
        Deck {
            slides: vec![
                Slide {
                    shapes: vec![
                        Shape {
                            kind: "rect".into(),
                            x: 100.0,
                            y: 80.0,
                            w: 300.0,
                            h: 160.0,
                            fill: "#ffd43b".into(),
                            stroke: "#e03131".into(),
                            stroke_width: 3.0,
                            dash: "dash".into(),
                            group_id: "diagram".into(),
                            text: "inside the box".into(),
                            text_align: "center".into(),
                            vertical_align: "center".into(),
                            rotation: -20.0,
                            ..Shape::default()
                        },
                        Shape {
                            kind: "ellipse".into(),
                            x: 500.0,
                            y: 200.0,
                            w: 180.0,
                            h: 180.0,
                            group_id: "diagram".into(),
                            ..Shape::default()
                        },
                        Shape {
                            kind: "arrow".into(),
                            x: 700.0,
                            y: 400.0,
                            w: -200.0,
                            h: 120.0,
                            stroke: "#1971c2".into(),
                            arrow_start: "oval".into(),
                            arrow_end: "diamond".into(),
                            ..Shape::default()
                        },
                        Shape {
                            kind: "text".into(),
                            x: 200.0,
                            y: 500.0,
                            w: 400.0,
                            h: 100.0,
                            text: "hello <deck>\nsecond & line".into(),
                            font_size: 32.0,
                            text_color: "#2f9e44".into(),
                            font_family: "Times New Roman".into(),
                            bold: true,
                            italic: true,
                            underline: true,
                            text_align: "center".into(),
                            vertical_align: "bottom".into(),
                            stroke: "none".into(),
                            ..Shape::default()
                        },
                        Shape {
                            kind: "image".into(),
                            x: 640.0,
                            y: 40.0,
                            w: 320.0,
                            h: 180.0,
                            src: TINY_PNG.into(),
                            crop_left: 0.1,
                            crop_top: 0.2,
                            rotation: 15.0,
                            stroke: "none".into(),
                            ..Shape::default()
                        },
                    ],
                    background: "#212022".into(),
                },
                Slide {
                    shapes: vec![Shape {
                        kind: "pen".into(),
                        points: vec![[10.0, 20.0], [50.0, 60.0], [90.0, 30.0]],
                        stroke: "#862e9c".into(),
                        stroke_width: 4.0,
                        dash: "dot".into(),
                        arrow_start: "oval".into(),
                        arrow_end: "triangle".into(),
                        rotation: 45.0,
                        ..Shape::default()
                    }],
                    ..Slide::default()
                },
            ],
            ..Deck::default()
        }
    }

    #[test]
    fn round_trip_preserves_shapes() {
        let deck = sample_deck();
        let mut buffer = Cursor::new(Vec::new());
        write(&deck, &mut buffer).unwrap();
        buffer.set_position(0);
        let back = read(buffer).unwrap();

        assert_eq!(back.slides.len(), 2);
        let close = |a: f64, b: f64| (a - b).abs() < 0.5;
        for (slide_a, slide_b) in deck.slides.iter().zip(&back.slides) {
            assert_eq!(slide_a.shapes.len(), slide_b.shapes.len());
            assert_eq!(slide_a.background, slide_b.background);
            for (a, b) in slide_a.shapes.iter().zip(&slide_b.shapes) {
                assert_eq!(a.kind, b.kind);
                assert_eq!(a.stroke, b.stroke);
                assert_eq!(a.dash, b.dash);
                assert_eq!(a.fill, b.fill);
                assert_eq!(a.text, b.text);
                assert_eq!(a.group_id, b.group_id);
                assert!(close(a.stroke_width, b.stroke_width));
                if a.kind == "pen" {
                    assert_eq!(a.points.len(), b.points.len());
                    for (pa, pb) in a.points.iter().zip(&b.points) {
                        assert!(close(pa[0], pb[0]) && close(pa[1], pb[1]));
                    }
                } else {
                    assert!(close(a.x, b.x) && close(a.y, b.y));
                    assert!(close(a.w, b.w) && close(a.h, b.h));
                }
                if a.kind == "line" || a.kind == "arrow" || a.kind == "pen" {
                    assert_eq!(a.arrow_start, b.arrow_start);
                    assert_eq!(a.arrow_end, b.arrow_end);
                }
                assert!(close(a.rotation, b.rotation), "{} rotation", a.kind);
                if a.kind == "text" || !a.text.is_empty() {
                    assert!(close(a.font_size, b.font_size));
                    assert_eq!(a.text_color, b.text_color);
                    assert_eq!(a.font_family, b.font_family);
                    assert_eq!(a.bold, b.bold);
                    assert_eq!(a.italic, b.italic);
                    assert_eq!(a.underline, b.underline);
                    assert_eq!(a.text_align, b.text_align);
                    assert_eq!(a.vertical_align, b.vertical_align);
                }
                if a.kind == "image" {
                    assert_eq!(a.src, b.src);
                    assert!(close(a.crop_left, b.crop_left));
                    assert!(close(a.crop_top, b.crop_top));
                }
            }
        }
    }

    #[test]
    fn round_trip_preserves_custom_slide_size() {
        let mut deck = sample_deck();
        deck.slide_width = 720.0;
        deck.slide_height = 1280.0;
        let mut buffer = Cursor::new(Vec::new());
        write(&deck, &mut buffer).unwrap();
        buffer.set_position(0);
        let back = read(buffer).unwrap();
        assert_eq!(back.slide_width, 720.0);
        assert_eq!(back.slide_height, 1280.0);
    }

    #[test]
    fn imports_empty_line_declarations_without_editor_default_borders() {
        let xml = r#"<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:cSld><p:spTree>
            <p:sp><p:nvSpPr><p:cNvPr id="1" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
              <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="476250"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln/></p:spPr>
              <p:txBody><a:bodyPr/><a:p><a:r><a:t>plain text</a:t></a:r></a:p></p:txBody>
            </p:sp>
            <p:sp><p:nvSpPr><p:cNvPr id="2" name="Filled"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
              <p:spPr><a:xfrm><a:off x="0" y="476250"/><a:ext cx="952500" cy="476250"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="FFC000"/></a:solidFill><a:ln/></p:spPr>
            </p:sp>
          </p:spTree></p:cSld>
        </p:sld>"#;
        let scheme = HashMap::new();
        let clr_map = HashMap::new();
        let rels = HashMap::new();
        let defaults = HashMap::new();
        let ctx = SlideCtx {
            scheme: &scheme,
            clr_map: &clr_map,
            rels: &rels,
            defaults: &defaults,
        };

        let part = parse_part(xml, &ctx, true).unwrap();

        assert_eq!(part.visible.len(), 2);
        assert_eq!(part.visible[0].kind, "text");
        assert_eq!(part.visible[0].stroke, "none");
        assert_eq!(part.visible[1].kind, "rect");
        assert_eq!(part.visible[1].fill, "#ffc000");
        assert_eq!(part.visible[1].stroke, "none");
    }

    #[test]
    fn round_trip_restores_an_editable_code_block_from_its_picture() {
        let svg = base64::engine::general_purpose::STANDARD.encode(
            br#"<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>"#,
        );
        let code = Shape {
            kind: "code".into(),
            x: 120.0,
            y: 90.0,
            w: 960.0,
            h: 540.0,
            text: "fn main() {\n  println!(\"hello\");\n}".into(),
            src: format!("data:image/svg+xml;base64,{svg}"),
            font_size: 22.0,
            code_format: "terminal".into(),
            code_language: "rust".into(),
            code_highlights: vec![2],
            code_callouts: vec![1, 3],
            show_line_numbers: false,
            ..Shape::default()
        };
        let deck = Deck {
            slides: vec![Slide {
                shapes: vec![code.clone()],
                ..Slide::default()
            }],
            ..Deck::default()
        };
        let mut buffer = Cursor::new(Vec::new());
        write(&deck, &mut buffer).unwrap();
        buffer.set_position(0);
        let back = read(buffer).unwrap();
        let restored = &back.slides[0].shapes[0];

        assert_eq!(restored.kind, "code");
        assert_eq!(restored.text, code.text);
        assert_eq!(restored.code_format, "terminal");
        assert_eq!(restored.code_language, "rust");
        assert_eq!(restored.code_highlights, vec![2]);
        assert_eq!(restored.code_callouts, vec![1, 3]);
        assert!(!restored.show_line_numbers);
        assert!(restored.src.starts_with("data:image/svg+xml;base64,"));
    }

    /// A minimal package shaped the way PowerPoint writes one: theme colors
    /// referenced by schemeClr, a placeholder that inherits its box from the
    /// layout, a picture, and an empty prompt placeholder to drop.
    #[test]
    fn imports_powerpoint_style_parts() {
        let theme = "<?xml version=\"1.0\"?>\
<a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">\
<a:themeElements><a:clrScheme name=\"t\">\
<a:dk1><a:sysClr val=\"windowText\" lastClr=\"111111\"/></a:dk1>\
<a:lt1><a:sysClr val=\"window\" lastClr=\"FFFFFF\"/></a:lt1>\
<a:dk2><a:srgbClr val=\"232F3E\"/></a:dk2><a:lt2><a:srgbClr val=\"F1F3F3\"/></a:lt2>\
<a:accent1><a:srgbClr val=\"ED7100\"/></a:accent1><a:accent2><a:srgbClr val=\"037F0C\"/></a:accent2>\
<a:accent3><a:srgbClr val=\"000000\"/></a:accent3><a:accent4><a:srgbClr val=\"000000\"/></a:accent4>\
<a:accent5><a:srgbClr val=\"000000\"/></a:accent5><a:accent6><a:srgbClr val=\"000000\"/></a:accent6>\
<a:hlink><a:srgbClr val=\"000000\"/></a:hlink><a:folHlink><a:srgbClr val=\"000000\"/></a:folHlink>\
</a:clrScheme></a:themeElements></a:theme>";
        let master = "<?xml version=\"1.0\"?>\
<p:sldMaster xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\
<p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Master band\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>\
<p:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"952500\" cy=\"476250\"/></a:xfrm>\
<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val=\"accent2\"/></a:solidFill></p:spPr></p:sp>\
</p:spTree></p:cSld>\
<p:clrMap bg1=\"dk1\" tx1=\"lt1\" bg2=\"dk2\" tx2=\"lt2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\"/>\
<p:txStyles><p:titleStyle><a:lvl1pPr algn=\"ctr\"><a:defRPr sz=\"3200\" b=\"1\">\
<a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"Arial\"/></a:defRPr></a:lvl1pPr></p:titleStyle>\
</p:txStyles></p:sldMaster>";
        let layout = "<?xml version=\"1.0\"?>\
<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"212022\"/></a:solidFill></p:bgPr></p:bg>\
<p:spTree><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title\"/><p:cNvSpPr/>\
<p:nvPr><p:ph type=\"title\" idx=\"4\"/></p:nvPr></p:nvSpPr>\
<p:spPr><a:xfrm><a:off x=\"952500\" y=\"476250\"/><a:ext cx=\"3810000\" cy=\"952500\"/></a:xfrm></p:spPr>\
</p:sp>\
<p:pic><p:nvPicPr><p:cNvPr id=\"3\" name=\"Layout logo\"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>\
<p:blipFill><a:blip r:embed=\"rId2\"/></p:blipFill><p:spPr><a:xfrm><a:off x=\"10477500\" y=\"476250\"/>\
<a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm><a:prstGeom prst=\"rect\"/></p:spPr></p:pic>\
</p:spTree></p:cSld></p:sldLayout>";
        let slide = "<?xml version=\"1.0\"?>\
<p:sld xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\
<p:cSld><p:spTree>\
<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"/><p:cNvSpPr/>\
<p:nvPr><p:ph type=\"title\" idx=\"4\"/></p:nvPr></p:nvSpPr><p:spPr/>\
<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang=\"en-US\"/><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>\
<p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Empty prompt\"/><p:cNvSpPr/>\
<p:nvPr><p:ph type=\"body\" idx=\"9\"/></p:nvPr></p:nvSpPr><p:spPr/>\
<p:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>\
<p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Band\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>\
<p:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"1905000\" cy=\"952500\"/></a:xfrm>\
<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom>\
<a:solidFill><a:schemeClr val=\"accent1\"><a:shade val=\"50000\"/></a:schemeClr></a:solidFill></p:spPr>\
<p:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>\
<p:pic><p:nvPicPr><p:cNvPr id=\"5\" name=\"Picture 4\"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>\
<p:blipFill><a:blip r:embed=\"rId2\"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>\
<p:spPr><a:xfrm><a:off x=\"952500\" y=\"1905000\"/><a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm>\
<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr></p:pic>\
</p:spTree></p:cSld></p:sld>";
        let slide_rels = "<?xml version=\"1.0\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/image1.png\"/>\
</Relationships>";
        let layout_rels = "<?xml version=\"1.0\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"../slideMasters/slideMaster2.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/image1.png\"/>\
</Relationships>";
        let master_rels = "<?xml version=\"1.0\"?>\
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme\" Target=\"../theme/theme2.xml\"/>\
</Relationships>";
        let png = base64::engine::general_purpose::STANDARD
            .decode(TINY_PNG.split_once("base64,").unwrap().1)
            .unwrap();

        let mut buffer = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buffer);
            let opts = zip::write::SimpleFileOptions::default();
            for (name, body) in [
                ("ppt/theme/theme2.xml", theme.as_bytes()),
                ("ppt/slideMasters/slideMaster2.xml", master.as_bytes()),
                (
                    "ppt/slideMasters/_rels/slideMaster2.xml.rels",
                    master_rels.as_bytes(),
                ),
                ("ppt/slideLayouts/slideLayout1.xml", layout.as_bytes()),
                (
                    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
                    layout_rels.as_bytes(),
                ),
                ("ppt/slides/slide1.xml", slide.as_bytes()),
                ("ppt/slides/_rels/slide1.xml.rels", slide_rels.as_bytes()),
                ("ppt/media/image1.png", &png),
            ] {
                zip.start_file(name, opts).unwrap();
                zip.write_all(body).unwrap();
            }
            zip.finish().unwrap();
        }
        buffer.set_position(0);
        let deck = read(buffer).unwrap();
        let shapes = &deck.slides[0].shapes;

        // The layout's solid background is the slide's color, not a shape on
        // top of it.
        assert_eq!(deck.slides[0].background, "#212022");

        // The empty prompt placeholder is gone. Master artwork, layout logo
        // and slide-owned shapes keep their layer order.
        assert_eq!(shapes.len(), 5);

        let master_band = &shapes[0];
        assert_eq!(master_band.kind, "rect");
        assert_eq!(master_band.fill, "#037f0c");
        // The file names no algn or anchor on this rect, and text typed into a
        // rect here sits in the middle of it. Read as top left, the first line
        // typed into an opened shape landed where no shape drawn here would
        // put it.
        assert_eq!(master_band.text_align, "center");
        assert_eq!(master_band.vertical_align, "center");

        let layout_logo = &shapes[1];
        assert_eq!(layout_logo.kind, "image");
        assert_eq!(layout_logo.src, TINY_PNG);

        let title = &shapes[2];
        assert_eq!(title.kind, "text");
        // 952500 EMU = 100 px: the box came from the layout.
        assert!((title.x - 100.0).abs() < 0.5 && (title.y - 50.0).abs() < 0.5);
        assert!((title.w - 400.0).abs() < 0.5 && (title.h - 100.0).abs() < 0.5);
        assert_eq!(title.text_color, "#ffffff");
        assert!((title.font_size - 42.7).abs() < 0.1);
        assert_eq!(title.font_family, "Arial");
        assert!(title.bold);
        assert_eq!(title.text_align, "center");

        let band = &shapes[3];
        assert_eq!(band.kind, "rect");
        // accent1 ED7100 shaded to 50%.
        assert_eq!(band.fill, "#773900");

        let pic = &shapes[4];
        assert_eq!(pic.kind, "image");
        assert_eq!(pic.src, TINY_PNG);
        assert!((pic.x - 100.0).abs() < 0.5 && (pic.w - 100.0).abs() < 0.5);
    }

    #[test]
    fn imports_relationship_backed_background_images() {
        let xml = "<p:sldLayout xmlns:a=\"a\" xmlns:r=\"r\" xmlns:p=\"p\">\
<p:cSld><p:bg><p:bgPr><a:blipFill><a:blip r:embed=\"rId2\"/>\
</a:blipFill></p:bgPr></p:bg></p:cSld></p:sldLayout>";
        let rels = HashMap::from([(
            "rId2".into(),
            ("image".into(), "ppt/media/background.png".into()),
        )]);
        let scheme = HashMap::new();
        let clr_map = HashMap::new();
        let defaults = HashMap::new();
        let ctx = SlideCtx {
            scheme: &scheme,
            clr_map: &clr_map,
            rels: &rels,
            defaults: &defaults,
        };

        let background = parse_background(xml, &ctx, 1280.0, 720.0).unwrap();
        assert_eq!(background.kind, "image");
        assert_eq!(background.src, "ppt/media/background.png");
        assert_eq!((background.w, background.h), (1280.0, 720.0));
    }

    /// A slide part carries its background before its shape tree, and a white
    /// slide writes no background element at all.
    #[test]
    fn background_is_written_only_when_it_is_not_white() {
        let mut buffer = Cursor::new(Vec::new());
        write(&sample_deck(), &mut buffer).unwrap();
        buffer.set_position(0);
        let mut archive = zip::ZipArchive::new(buffer).unwrap();

        let colored = part(&mut archive, "ppt/slides/slide1.xml").unwrap();
        assert!(colored.contains("<p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"212022\"/>"));
        assert!(colored.find("<p:bg>").unwrap() < colored.find("<p:spTree>").unwrap());

        let white = part(&mut archive, "ppt/slides/slide2.xml").unwrap();
        assert!(!white.contains("<p:bg>"));
    }

    #[test]
    fn written_file_contains_required_parts() {
        let mut buffer = Cursor::new(Vec::new());
        write(&sample_deck(), &mut buffer).unwrap();
        buffer.set_position(0);
        let mut archive = zip::ZipArchive::new(buffer).unwrap();
        for part in [
            "[Content_Types].xml",
            "_rels/.rels",
            "ppt/presentation.xml",
            "ppt/slideMasters/slideMaster1.xml",
            "ppt/slideLayouts/slideLayout1.xml",
            "ppt/theme/theme1.xml",
            "ppt/slides/slide1.xml",
            "ppt/slides/slide2.xml",
        ] {
            assert!(archive.by_name(part).is_ok(), "missing {part}");
        }
    }

    /// Import and export must accept the same formats. When they drifted
    /// apart, a webp picture imported fine and then vanished on save.
    #[test]
    fn every_importable_picture_format_is_writable() {
        let types = content_types(1);
        for (ext, mime) in IMAGE_FORMATS {
            assert_eq!(mime_for_ext(ext), Some(mime), "{ext} not importable");
            let url = format!("data:{mime};base64,AAAA");
            assert_eq!(
                decode_data_url(&url).map(|(e, _)| e),
                Some(ext),
                "{mime} imports but does not export"
            );
            assert!(
                types.contains(&format!("Extension=\"{ext}\"")),
                "{ext} is missing from the content types"
            );
        }
        // .jpg parts are common and map onto the jpeg entry.
        assert_eq!(mime_for_ext("JPG"), Some("image/jpeg"));
        // Formats a webview cannot draw stay out of both directions.
        assert_eq!(mime_for_ext("tiff"), None);
        assert_eq!(decode_data_url("data:image/tiff;base64,AAAA"), None);
        assert_eq!(decode_data_url("https://example.com/a.png"), None);
    }

    #[test]
    fn foreign_slide_sizes_keep_their_declared_canvas() {
        let sz = parse_sld_sz(
            "<p:presentation xmlns:p=\"x\"><p:sldSz cx=\"6858000\" cy=\"12192000\"/>\
<p:notesSz cx=\"1\" cy=\"1\"/></p:presentation>",
        )
        .unwrap();
        assert_eq!(sz, (6858000.0, 12192000.0));
        assert_eq!(sz.0 / EMU_PER_PX, 720.0);
        assert_eq!(sz.1 / EMU_PER_PX, 1280.0);
    }

    #[test]
fn empty_deck_still_writes_one_slide() {
    let mut buffer = Cursor::new(Vec::new());
    write(&Deck::default(), &mut buffer).unwrap();
    buffer.set_position(0);
    let back = read(buffer).unwrap();
    assert_eq!(back.slides.len(), 1);
    assert!(back.slides[0].shapes.is_empty());
}
