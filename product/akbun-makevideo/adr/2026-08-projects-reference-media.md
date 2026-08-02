# A project is a folder that references media, never a copy of it

## Decision

Projects live in folders under a workspace directory, `~/Documents/akbun-makevideo` by default and settable. Each project folder holds one `project.akbunvideo`, and renders default alongside it.

Importing media writes an absolute path into that file and copies nothing. Not at import, not at save, not at render.

## Reason

The alternative is a self contained project folder, which is what a tidy-minded change would reach for. It does not survive contact with video. A 40 GB shoot copied in to trim thirty seconds out of it fills a disk to no purpose, the same footage is usually shared between projects, and a copy is a second thing that can drift from the first. The file being edited and the file the user sees in Finder should be one file.

The cost is real and is accepted: moving or deleting media breaks the project. A clip whose path no longer resolves is drawn hatched red in the timeline and skipped by the render rather than failing it, so one missing file does not cost the whole render. A relink dialog is the obvious next feature — and it is a feature rather than a fix, because the breakage is the intended consequence of the rule, not a defect in it.

This is the invariant a future change is most likely to break while meaning well, so it has a test of its own rather than only a paragraph: a project round trips a path on an external volume unchanged, and fails if a save ever starts rewriting media paths into the project folder.

## Why a workspace folder at all

Projects had no home before this: New Project reset the model and Save asked where to put a file, so a project was wherever the user last clicked. That makes an Open list impossible and leaves renders scattered.

A named folder per project gives one place for the edit and its output, an Open list that does not need a file dialog, and a sensible default for the render path. It costs New Project a name prompt, which is the moment a name is easiest to ask for anyway.

The folder is made and the project file written immediately on create, rather than at first save. An empty folder would not appear in the Open list, so a project created and not yet saved would look like it was never made.
