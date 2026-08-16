# AI right panel design QA

- viewport: 1440 x 900 CSS px; minimum-window check at 1000 x 640 CSS px
- pixels and density: source 2808 x 2494 px, rendered attachment reference approximately 1694 x 1512 CSS px; implementation 1440 x 900 px at device scale 1
- normalization: full views were fit to frame because the source is a taller reference product, not a clone target. Focused panels were cropped to 626 x 2494 source pixels and 320 x 803 implementation pixels, then compared fit-to-height.
- state: source shows an image-generation turn; implementation shows the required new-conversation composer. The comparison judges the shared right-panel structure and bottom composer, not dynamic content parity.

**Findings**

- No actionable P0, P1, or P2 visual mismatch remains. The implementation preserves the source's full-height assistant rail and bottom-anchored mode/composer structure while using the editor's existing compact typography, borders, blue selection token, and fixed 320 px panel.
- Fonts and typography: system sans-serif, compact hierarchy, wrapping, and optical weights are consistent with the existing editor. The larger Korean title treatment in the source is intentionally replaced by the editor's Inspector/AI tabs and compact conversation header.
- Spacing and layout rhythm: the right panel remains 320 px, the stage ends exactly at the panel edge, and no horizontal or vertical document overflow occurs at 1000 x 640.
- Colors and visual tokens: neutral surfaces, subtle dividers, and the existing blue active/focus state remain consistent. Contrast and focus outlines are visible.
- Image quality and asset fidelity: no decorative source asset was imitated. Generated images use the actual model result and remain in their session; the empty new-chat state correctly contains no placeholder image.
- Copy and content: connection, retention, read-only, deletion, stop, and 128 MiB guidance are explicit and stand alone without conversation context.

**Open Questions**

- None. The source's active image-generation content and taller viewport are reference-only differences; product requirements define the implemented new-chat state and 320 px width.

**Implementation Checklist**

- [x] Inspector/AI tabs preserve the selected live view.
- [x] New conversation, Text/Image/Slide modes, and slide target work.
- [x] Settings exposes ChatGPT subscription status only.
- [x] Minimum 1000 x 640 window has no document overflow or panel overlap.
- [x] Empty/unavailable states and keyboard-accessible tab roles are present.
- [x] Browser console checked with zero errors or warnings.

**Comparison History**

- Pass 1: output mode buttons were visually correct but lacked `role="tab"` inside their tablist, an accessibility P2. Added the role to Text, Image, and Slide.
- Pass 2: browser DOM exposed five tabs (Inspector, AI, Text, Image, Slide); the full and focused comparisons showed no remaining P0/P1/P2 issue. Console errors and warnings: none.

**Primary Interactions Tested**

- Inspector to AI and back-capable panel flow.
- New conversation creation before first persistence.
- Text, Image, and Slide selection; Slide 1 default target.
- Settings, AI subscription status and refresh control.
- Desktop-required unavailable message without creating a session.

**Follow-up Polish**

- None required for handoff.

final result: passed
