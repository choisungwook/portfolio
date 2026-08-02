# The waveform is columns, pushed by a poller

## Decision

The audio callback does not talk to the page. It folds each block into a running bucket of 512 frames and appends one column, the loudest sample in that bucket, when the bucket fills. A separate thread wakes every 33 ms, takes the columns produced since it last looked, and emits one event carrying those columns, the merged level meter and the elapsed time. The page appends the columns to its own array and redraws.

## Reason

Three things were being traded: how much the realtime thread does, how much crosses the bridge, and how much the page redraws.

The realtime thread has the hardest constraint. It must not allocate, must not block on a lock it can lose, and must not wait on anything. Emitting a window event does all three, because the bridge serializes, allocates and takes locks inside the webview. An audio callback that does that produces a click in the recording, which is the one defect this app cannot ship with. So the callback does arithmetic into memory it already owns, and nothing else.

What crosses the bridge is bounded by the same reasoning from the other side. At 48 kHz the callback runs a few hundred times a second; an event per callback would spend the main thread in the IPC layer. Thirty a second is smooth to the eye and is roughly three columns per event.

Sending only the new columns, rather than the whole waveform, is what keeps a long take cheap. A snapshot of the whole array thirty times a second grows with the recording: at an hour it is several hundred thousand numbers per event. The poller carries a cursor of how many columns it has already sent, so a poll that arrives late sends everything since the last one and nothing is skipped or repeated. Both halves of that are tested in the model crate.

The level meter merges between polls rather than sampling. A meter that showed whichever block happened to be last would miss every peak in between, which is exactly the moment a meter exists to show. The clip indicator is sticky for the take for the same reason: a single sample over full scale is worth knowing about a minute later.

The bucket size, 512 frames, is about 93 columns a second at 48 kHz. Dense enough to see a syllable, sparse enough that redrawing an hour long take is a loop over a few hundred thousand numbers that the page then folds down to the width of the canvas.

The cost is that the page holds a second copy of the waveform and can drift from the backend's if a poll is dropped. That is bounded: the finished take carries its whole column array in the snapshot, so stopping a recording replaces the page's copy with the authoritative one.
