# The timeline model

The model lives in Rust, in `src-tauri/crates/edit`. The page sends a command and redraws from the state that comes back; it does not change the project itself. See [the edit model in Rust](../../adr/2026-08-edit-model-in-rust.md) for why it moved there, and [the record it replaces](../../adr/2026-08-timeline-model-in-the-page.md) for what it used to be.

## The three pieces of the crate

| File | What it holds |
|---|---|
| `lib.rs` | The types a project file holds, the invariants a clip has to satisfy, and the arithmetic on a track |
| `command.rs` | Every edit, as a command that hands back its own inverse |
| `document.rs` | The one open project: the undo and redo stacks, and the revision number |

`migrate.rs` is next to them and opens a project file whatever version wrote it.

## The command

`Document::apply` takes one command and is all or nothing. It performs it, checks the invariants, and if either step fails it applies the inverse and returns the reason. So there is no state in which half an edit happened.

A `Transaction` is several commands as one undo step — dropping three files imports them and lays down three clips, and one press of undo takes all of it back. It rolls back the same way: the inverses collected so far, applied in reverse.

Undo stores the inverse rather than a copy of the project. Trimming one clip stores one clip either way; the difference is everything else on an hour long timeline.

Commands that create something — `addClip`, `splitAt` — arrive without ids and are stored in the history *with* the ids they were given, so redo reproduces the same clips rather than new ones that merely resemble them.

Visual items follow the same command boundary. Add, transform, timing, order, content and remove commands each store an inverse; the page never edits `visualItems` directly.

## The invariants

Checked after every command, against the whole project:

- a clip has a length, its in point is not negative, and it does not reach past the end of its source
- clips on a track do not overlap, and none starts before the timeline does
- a link group has one video clip and one audio clip from the same asset, with matching timeline and source ranges
- a visual item belongs to a video track, has positive time and area, finite project-space geometry and opacity from zero through one

A broken one does not show on the timeline. A zero length clip draws as nothing and an out point past the end of a file draws as the last frame; both surface as an ffmpeg failure or a black stretch part way through a render that has been running for ten minutes.

Opening a file is the exception: `Project::repair` pulls a clip back to the nearest state that keeps the rules rather than refusing to open. A project written by an older build, or one whose media has been re-encoded to a slightly different length since it was imported, has to keep opening.

Moving, trimming, splitting, deleting, and ripple deleting one linked clip expands to its whole group. A linked move uses the same delta on both tracks and fails as one edit if either destination is occupied. Splitting keeps the left pair in its group and gives the right pair a new group, so the two halves can be edited independently.

## The revision

Every change bumps `Document::revision`, undo and redo included. Two things use it:

- the page compares it against the revision it last saved, which is what puts the dot in the title bar — and takes it away again when you undo back to where you saved
- a render records it when it starts and compares it when it finishes, so the dialog can say the file is the timeline as it was rather than let somebody compare the output against what is now on screen

## What the page still computes

`src/timeline.js` has no writers left. What is there is what a redraw and a drag need between frames: where a clip sits in pixels, what is under the playhead, which edge the magnet would take.

A clip being dragged is moved by setting its own `left` and `width`. Nothing is sent until the pointer comes up, which is the reason the drag still feels immediate — and the reason this arithmetic is duplicated at all. The page predicts, Rust decides, and where they differ the page is wrong for one frame and then redraws.

The one rule that follows: **nothing in `timeline.js` may touch the DOM or `window.api`**, or the tests stop running.

## What a time is

Every time on both sides is a frame index on the project rate, and `src/time.js` is where anything that crosses a unit boundary happens: milliseconds from ffprobe, seconds from a media element, another rate. `crates/time` is the same model on the Rust side, tested over the same eight rates. The reason it is a frame count rather than a millisecond is in [rational time](../../adr/2026-08-rational-time.md).

Two consequences worth knowing before reading the code:

- Lengths that read as wall clock are stated in seconds and converted, because a tenth of a second is three frames of 30 and six of 60. That is `MIN_CLIP_SECONDS`, `DEFAULT_IMAGE_SECONDS` and the ruler tick steps.
- Pixels convert through the rate too: `framesToPx` and `pxToFrames` take it. The playhead is allowed a fractional frame, because a media clock does not stop on frame boundaries; a command rounds first.
