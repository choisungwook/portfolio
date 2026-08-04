# The editing model lives in Rust, and every edit is a command

Replaces [the editing model lives in JavaScript](./2026-08-timeline-model-in-the-page.md).

## Decision

The project is owned by one `Document` in `src-tauri/crates/edit`. The page sends a command and redraws from the state that comes back; it changes nothing itself. Every edit is a command that hands back its own inverse, and the inverses are the undo stack. Several commands can be one transaction, which either lands whole or not at all. Every change bumps a revision number.

The page keeps one thing: a drag in progress draws itself, by setting the moving clip's own `left` and `width`. A command goes over when the pointer comes up and not before.

## Reason

The earlier record put the model in the page because a drag has to answer on the next frame, and a round trip per mouse move would not keep up. That reasoning has not stopped being true — which is why the drag still draws itself here. What changed is what else needs the model.

The playback engine has to decide, frame by frame, what to decode. It can only do that if it can read the timeline whenever it wants. A JSON snapshot handed over with a render request answers "what did the timeline look like when the button was pressed", which is a different question. So either the engine gets its own copy of the model, or the model moves to where the engine already is. Two copies of a model that both get written to is the arrangement whose failures do not reproduce: a preview that disagrees with the render, once, on a timeline nobody can reconstruct.

Undo is the other half. There was none at all, and [clips do not overlap](./2026-08-clips-do-not-overlap.md) reads the way it does partly because there was nothing to take a destructive edit back with. Once the edits are commands the inverse is nearly free, and ripple delete — delete and close the gap — became reasonable to make a normal thing rather than a thing to be careful about.

Storing an inverse rather than a copy of the project is the point of doing it this way. A copy per edit costs the whole project each time, and a timeline is not small. An inverse costs what the edit touched: one clip for a trim, one clip and everything after it for a ripple.

Transactions are all or nothing because a half applied edit is a state nobody can reason about. If a drop imports three files and lays down two clips before failing, the user cannot tell how many times to press undo, and neither can the app.

The invariants — a clip has a length, its in point is not negative, it does not reach past the end of its source — are checked in the model rather than trusted. None of those breakages show up on the timeline. They show up part way through a render, which is the most expensive place in this app to find out about anything.

The revision number is what lets a long job tell whether the timeline moved underneath it. Editing during a render is allowed, so a finished file can be of a timeline that no longer exists; comparing the number is how the app can say so rather than let somebody conclude the render is broken.

## What this costs

The snapping and pixel arithmetic now exists twice: in Rust, which decides, and in `src/timeline.js`, which predicts so a drag can be drawn. That duplication is deliberate and bounded — the page's copy only ever affects one frame of drawing, because what lands is what Rust sends back. The failure mode is a clip that appears to jump on release, which is visible immediately, rather than two models that quietly drift.

The other cost is a round trip per edit. A click that used to be a function call is now IPC. That is fine for the things a user does discretely and it is exactly why the drag was kept out of it.
