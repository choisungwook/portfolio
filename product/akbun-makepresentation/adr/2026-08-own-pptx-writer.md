# Hand-written OOXML subset instead of a document library

## Decision

Read and write .pptx directly in the deck crate: writing builds the zip parts from string templates, reading walks each slide part with quick-xml and keeps only what the editor understands (preset rects, ellipses, lines, custom-geometry paths, text boxes). No document library.

## Reason

A .pptx is a zip of XML, and the shape vocabulary of this editor is six kinds with explicit colors. The whole writer — content types, relationships, a minimal master/layout/theme, and one template per shape kind — is a few hundred lines that never change shape at runtime. The Rust crates that model OOXML generically are young, huge, or both, and every one of them would still leave the mapping between this editor's model and DrawingML to be written by hand, because that mapping is the actual work.

Owning the reader also makes the failure mode honest. Files from other tools are read as the supported subset: unknown presets become their bounding rectangle so the slide stays editable, groups are skipped rather than mis-placed, theme colors fall back to gray. A library would not remove those decisions; it would just move them behind someone else's types.

The subset is verified from the outside: the test suite round-trips every shape kind, and the generated file was checked against an independent OOXML reader (python-pptx), which sees the expected auto shapes, text boxes and lines.
