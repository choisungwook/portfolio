# The editing model lives in JavaScript, Rust reads the same shape

Replaced by [the editing model lives in Rust](./2026-08-edit-model-in-rust.md). What follows is what was decided at the time and why; the part of it that survived is that a drag still draws itself in the page.

## Decision

`src/timeline.js` owns the project model and every piece of arithmetic on it: placing, moving, trimming, splitting, snapping, and answering what is under the playhead. Rust deserializes the same JSON into serde types in `crates/render` for the render and the project file, and never edits it.

## Reason

A drag has to answer on the next frame. An IPC round trip per mouse move would not keep up, so the model has to be in the page during an edit — and once it is there for editing, having Rust own the canonical copy would mean two models and a synchronisation problem.

The other direction was considered: keep everything in Rust and have the page send edits and redraw from the returned state, which is the pattern akbun-folderview uses. It works there because the edits are discrete — rate a photo, add a tag. Here the edits are continuous, and the smallest unit of work is a mouse move.

So the split is by responsibility rather than by ownership. The page is the only writer. Rust is a reader with two jobs the page cannot do, and it reads the shape the page wrote.

The duplication that remains is the type definition, in `timeline.js` and in `lib.rs`. That is real and accepted, and it has one failure mode: a field added on one side and not the other. The guards are `#[serde(default)]` on every optional field, so an older project file still opens, and a round trip test that asserts the camelCase names actually match.

The rule this imposes: nothing in `timeline.js` may touch the DOM or `window.api`. It is what keeps the model under `node --test`, and it is easy to break by accident.
