# Crop as a box you can reframe

## Status

Accepted, 2026-08-02.

## Context

Crop cut the image on mouseup. The drag was the whole interaction: press, drag, release, and the pixels outside were gone. Getting the framing right in one drag is not something a hand does reliably, so the recovery path was Cmd+Z and another attempt, and the dim at 0.45 read as a shaded part of the picture rather than as the part about to be discarded.

Every other editor puts a box down, lets it be adjusted, and waits to be told. The gap was not a missing feature so much as a missing pause between framing and cutting.

## Decision

The drag leaves `cropBox` on screen instead of applying. Enter, a double click, or a save applies it; Escape, leaving the crop tool, or a drag starting outside the box drops it. Pulling a corner reframes and dragging the middle slides the whole box.

The box is not a shape and never enters the document, but it has two corners like a rectangle, so `handles`, `handleAt`, `bounds` and `moveShape` already describe it. The mousemove branches were reading `selected` directly; they now write to a named `dragTarget`, which the select tool points at the selection and the crop tool points at the box.

Outside the box is dimmed to 0.65, and the corners carry white L brackets with an arm capped at a third of the box.

## Consequences

Saving with a box still up crops rather than discarding it. The dimming lives on the canvas, so leaving the box in place would bake the overlay into the png, and taking the framing is what the screen is promising.

The brackets are drawn rather than being the round grips a selected shape gets. They are the shape a crop corner has everywhere else, and they read as a frame instead of as something in the picture. The cost is a second grip style in one file.

`dragTarget` is a third pointer into a document that could go away mid-drag, so `dropPointers` clears it with the rest.

Reframing is not undoable step by step. The box is not in the document and nothing is lost until it is applied, so a wrong pull is fixed by pulling again; only the applied crop takes a history entry.
