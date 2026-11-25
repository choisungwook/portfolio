# 0.1.0

First version.

## Added

- Library in `~/PianoCoach`: import MusicXML (`.musicxml`, `.xml`, `.mxl`), MIDI files, or photos of the pages.
- Score recognition from photos with Codex (ChatGPT plan) or the Claude API. Each measure is checked for beat count and readability; failed pages are asked again, and the rest can be fixed per measure in the Review view.
- Practice: a full-width score with cursor, a large play/pause button, tempo 0.25× to 1.5×, measure loop, one hand at a time, metronome.
- 2D keyboard, or a 3D piano under the score where virtual hands with jointed fingers strike the keys with the score's fingering.
- A USB-MIDI piano lights up the keys you press.
- Review view for photo-recognized songs.
- Finger numbers on every sounding key in both hands: printed fingering when the score has it, a suggested finger when it does not.
- Icon toggles for repeat, metronome, the piano panel (score only) and the 3D hands.
- Check for Updates on macOS and Windows.
