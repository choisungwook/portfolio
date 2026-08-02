# One track, no mixer

## Decision

The app has exactly one track, labelled A, holding one take. Recording again produces a new take file and replaces what track A shows. There is no second track, no mixdown, no trim and no fade.

## Reason

The recording this app exists for is one person, one microphone or one interface, one continuous take. Everything after that take is editing, and an editor already exists on every machine this will run on. Building a second track would mean deciding what happens when two devices run at different clocks, what mixing does to levels, and how a timeline is scrolled and zoomed. None of that is written, and writing it would delay the part that is actually missing, which is getting a clean take onto disk while watching the level.

Track A is still called a track rather than "the recording" on purpose. It is the shape the app would grow into if a second input were ever wanted, and naming it that way now means the page does not have to be rearranged later.

The cost is honest and worth stating. Two people on two microphones cannot be recorded separately here; they have to go into two channels of one interface, which the app does record and does draw, but as one waveform. A take is also not editable in place: a fluffed line means recording another take and picking the good one in an editor.

What keeps this from being a trap is the numbering. Takes are `take-001.wav` upwards inside the project folder and are never overwritten, so recording again costs nothing and the earlier attempt is still there. The app forgets a previous take; the disk does not.
