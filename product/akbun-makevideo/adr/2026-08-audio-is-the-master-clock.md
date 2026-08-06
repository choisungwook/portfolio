# The audio output is the master clock and the picture follows it

## Decision

Make the sound the timebase for playback. The clock is a count of the sample frames handed to the output, converted to a frame of the project rate by the time crate, and the picture is shown against that. Nothing corrects the sound to match anything else.

Mix at one rate for the whole engine, and make it the render's `AUDIO_HZ` rather than a constant of its own. Resample sources on the way in with the same `aformat` filter the export chain opens with, so one resampler serves both.

Forbid allocation, locks and file access inside the audio callback, and put that rule in the one module the callback touches. The ring between the mixer and the callback is lock free and needs no `unsafe`; everything else happens on a feeder thread that runs ahead of the sound.

Keep a test that mixes the same project through the engine and through the render's own `amix`, with sources at different sample rates, and compares the samples.

Treat an output that changes or disappears as an ordinary case: one thread owns the stream and rebuilds it on whatever the default output is now, leaving the ring, the clock and the decoders alone.

Land it headless, as the frame source was landed. The engine is driven by `audio-soak` and by tests, and is not connected to the window in this step.

## Why

- A frame shown late is a frame most people never notice; a gap in the sound is a click and everybody hears it, so the cheap correction is the picture and the expensive one is the sound.
- Two resamplers that disagree by a hundredth of a percent put the sound a frame away from the picture inside ten minutes, and a project with mixed sample rates is where that starts.
- A missed deadline on the realtime thread is a click, and the faults that cause it — an allocation, a lock, a file read — are the kind that reproduce once a week and cost days to find, so they are worth refusing rather than measuring.
- If the mix that plays is not the mix that renders, every judgement made while editing is made about something nobody will hear, and nothing in the interface would say so.
- Taking headphones off is a normal thing to do, and an editor that stops or falls over when it happens has interrupted the work for a reason nobody will connect to what they did.
- Supply and mixing look alike through a speaker and have nothing to do with each other, so measuring the mix with no device attached is what keeps the next stage's failures readable.
