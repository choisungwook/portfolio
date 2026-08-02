# Playback reads on its own thread

## Decision

Playing a take starts an output stream at the take's own sample rate and a thread that reads the file. The two meet at a fixed size queue holding about a second of audio. The reader maps the file's channel count to the device's and parks when the queue is full; the output callback only pops, applies the volume, meters what it wrote, and writes silence when the queue is dry. Nothing is resampled.

## Reason

The obvious implementations are both wrong for a podcast take.

Reading the whole file into memory is the simplest, and it does not survive the use case. An hour of 48 kHz stereo as `f32` is around 1.4 GB. A podcast take is exactly the recording that runs an hour.

Reading from the file inside the output callback is the other, and it puts a disk read on a realtime thread. It works until the disk hesitates, and then it produces a dropout with no way to recover.

A reader thread and a bounded queue is the standard answer and costs about eighty lines. Memory is a second of audio whatever the take's length, the callback never touches a file, and a slow disk is absorbed rather than heard. The queue itself is plain arithmetic with no dependency on cpal, so it lives in the model crate with tests over the parts that are easy to get wrong: wrapping, a push larger than the free space, and an underrun reporting how much of the buffer was real audio.

The underrun behaviour is worth naming. The queue fills only what it has and says how much; the callback zeroes the rest. Leaving the tail alone would play the previous buffer again, which is a click. Silence is the honest failure.

Not resampling follows from what the take is. It was recorded from a device on this machine at that device's rate, so the output stream is asked for the same rate and every device that could have recorded it can play it. When a device genuinely cannot, the error says which rate was refused instead of the app quietly converting. Channel mapping is the one conversion that does happen, because it has an obvious right answer: a mono take is duplicated so it is heard in both ears rather than only the left, and a stereo take into a mono device is averaged.

Volume is read from an atomic on every callback rather than baked in at start, so dragging the slider is heard immediately. Recording is never scaled by it. An app that quietly changes what it writes to disk cannot be trusted with a take, and the meters would then be measuring something other than the file.

Stopping has one ordering rule that is easy to get wrong: signal the reader first, then drop the stream, then join. The reader parks when the queue is full, so joining before telling it to leave would hang on a playback that was paused with a full queue.
