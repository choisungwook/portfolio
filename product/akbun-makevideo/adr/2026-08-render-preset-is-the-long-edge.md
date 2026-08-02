# FHD and 4K set the long edge and keep the project aspect

## Decision

The Render menu offers FHD and 4K. They mean a long edge of 1920 and 3840, not a fixed 1920x1080 and 3840x2160. The other dimension comes from the project's own resolution, and both are rounded to even numbers.

## Reason

Reading the presets as fixed landscape frames breaks vertical projects, which is a normal thing to make. A 1080x1920 project rendered at a literal 1920x1080 would be a landscape frame with the video in a stripe down the middle and black either side — technically what was asked for, and never what was wanted.

Taking the long edge gives 1920x1080 for a 16:9 project, which is what anyone choosing "FHD" expects, and 1080x1920 for a vertical one, which is what they expect too. The preset stops meaning a frame size and starts meaning a quality level, which is closer to how people use the word.

The rounding is not cosmetic: h264 rejects odd dimensions, so a project resolution that divides badly would fail at encode time with an error from ffmpeg rather than from this app.

The project resolution stays a separate setting because it is a different thing — it is the editing canvas, the shape the preview is fitted to and the frame clips are scaled into. Rendering is where a size is chosen for the output.
