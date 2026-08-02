# Takes are 24 bit wav

## Decision

Every take is written as 24 bit fixed point wav at the input device's own sample rate and channel count. Samples arrive from the device in whatever format it speaks, are converted to `f32` in the callback, and are written out through one conversion. Nothing is resampled and nothing is mixed down.

## Reason

The choice is between 16 bit, 24 bit and 32 bit float, and it is about headroom against file size.

16 bit is the safe interchange format, and it is what a finished episode ships as. As a recording format it is thin: a podcast voice is levelled well below full scale on purpose, and every dB of that headroom is a bit not being used. A quiet passage that then gets raised in editing raises the noise floor with it.

32 bit float removes the question entirely, because a sample over full scale is still recoverable. It also doubles the file, and the headroom it buys past 24 bit is headroom a microphone preamp cannot produce. The gain would be theoretical and the cost would be on disk every time.

24 bit is what an interface's converter actually delivers, so it is the point where the file stops throwing away what the hardware gave it and stops storing precision the hardware never had. Every editor reads it.

Keeping the device's sample rate and channel count follows from the same idea. The app's job is to get what the interface produced onto disk, and any conversion it does on the way is a decision made without the user. If the interface is at 44.1 kHz the take is at 44.1 kHz, and an editor can convert later with more context than this app has.

The conversion at the boundary is clamped rather than wrapped, and that is the one part worth remembering. A sample over full scale is already distortion; wrapping it would turn a loud moment into a full scale click, which is much worse than the clipping it came from. That clamp has a test, as does the round trip through 24 bit.

The cost of not mixing down is that a two input interface with a microphone on one input produces a two channel file with one silent channel. That is what the hardware sent. The waveform and the meters take the loudest channel of each frame, so the display is right either way, and the silent channel is an editor's problem rather than a decision this app makes about someone's recording.
