# The program monitor

## What it is for

The two stages before this one each solved half of playback and were left
disconnected on purpose. [frame-source](./frame-source.md) produces frames at
playback speed; [audio](./audio.md) produces the sound and, while doing it, the
clock. Neither knows the other exists.

This is the join, and it is the part the product was actually stuck on. Not how
to draw a frame — that has one shader and a test that both backends agree — but
*when* to show one.

`crates/present` is where that lives, and none of it needs a window:

| Module | What it is |
|---|---|
| `schedule` | The decision, as a pure function over two frame numbers |
| `player` | One tick: read the clock, carry the decision out |
| `transport` | Play, pause and seek across the picture and the sound at once |
| `sink` | Where a frame ends up |
| `surface` | The swapchain, when there is a window |
| `fallback` | Which engine runs, and why it might not be this one |
| `soak` | Whether any of it keeps up, as a number |

## The decision is four words long

`schedule::step` takes the frame the source is holding and the frame the clock
is on, and answers one of four things.

| Answer | When | What happens |
|---|---|---|
| `Present` | they are the same | draw it |
| `Hold` | the source is ahead | leave the screen alone |
| `Skip` | the source is behind | take the frame and throw it away |
| `Resync` | a long way behind | jump the source forward to the clock |

`Skip` is the rule the whole stage is about. A frame that is already late is
never made current by drawing it — it is only in the way of the one that is.
Drawing it costs the same decode *and* leaves the picture behind the sound, and
every frame after it inherits the lateness.

Nothing ever sends a decoder backwards. `Resync` takes the clock's own position,
which is by definition ahead, and the test that says so sweeps every pair of
positions rather than checking a case.

It is a pure function because timing faults do not reproduce. A stutter is a
thing that happened once on a machine that was also doing something else, and
chasing it by watching the screen is how this problem stays unsolved.

## Floor one way, ceiling the other

Two conversions sit either side of the decision and they round in opposite
directions on purpose.

- `clock_frame` **floors**. Frame *n* is current from the instant it is due
  until *n+1* is, and rounding to nearest would make it current half a frame
  early — the picture would sit permanently ahead of the sound.
- `frame_due_samples` **ceils**. It answers the first sample at which a frame is
  current, which is what makes `clock_frame(frame_due_samples(n)) == n` hold.

`RationalTime` rounds to nearest, which is right for a playhead somebody reads
and for placing a clip in the mix, and wrong for both of these. At 29.97 a frame
is not a whole number of samples, so a rounded pair disagrees with itself by one
frame — the test asserting frame 999 lands on 999 is what caught it.

## Paused costs nothing

The app's playback thread has two stages and they hold different things.

| Stage | Holds | Runs |
|---|---|---|
| Still | a frame source and a clock nobody winds | nothing, once the frame is drawn |
| Playing | the transport, the decoders, the output device | the tick loop |

Pressing play builds the second and pausing throws it away. That costs a few
hundred milliseconds to the first frame — the soak reports it as the startup
delay — and it buys a paused editor with no decoder running and no audio device
open. The media element preview keeps a decoder per clip alive for as long as
the project is.

It also settles a question with no other good answer. The audio engine has no
pause: the ring is drained by whatever holds the consumer, and the consumer is
moved into the device. Stopping the sound therefore means dropping the device,
and the device cannot be reopened without the consumer back. Building both
together and dropping both together is the shape with no half state in it.

## The last frame needs telling

At the end of the timeline the clock stops a buffer short of the end, because it
subtracts the device's latency — 512 samples, a third of a frame at 30 fps,
which floors to the frame before the last one. The picture then waits for an
instant that will not arrive and playback hangs one frame from the end.

So the transport watches for the mix having ended with the ring empty, and tells
the scheduler the clock has stopped. A `Hold` becomes a `Present` from then on
and the timeline finishes on its last frame.

The soak found this as a three second stall at the end of
`continuous-playback`, in a run with no seek in it to explain one.

## The two halves of a seek are one operation

`Transport::seek` moves the frame source and the audio engine together, and the
ordering is the whole of it.

1. The scheduler is told first, and stops judging the clock from that instant.
2. The audio engine is asked, **in samples**, not frames. A frame index handed
   over and converted on the far side would round the target by up to half a
   frame while the mixer keeps the exact sample.
3. The engine answers when it answers. Until it does, the clock is still sitting
   at the old position and nothing may be read from it.

Step 3 is counted rather than flagged. `Feed::seeks_done` is a running total, so
the transport keeps its own running total and compares them. A version that
reset its own count worked perfectly for one seek and stalled on the second: the
engine's total was already past the new count, so the seek was called settled
before it was, the scheduler read a clock at the old position, decided the
picture was a long way behind and jumped the source *forward* — to a place the
clock was about to leave. The soak found that one too.

## Frames do not cross into the page

The page never sees a pixel. It sends transport commands and reads back a
position; the picture goes from the frame source to the compositor to the
window's own surface without being serialised once.

At 1080p30 the other way is about 250 MB a second of copying, which is more than
the whole real time budget. It is also what the old preview frame does, and why
that one only ever answers when the playhead has stopped.

The position is **polled** rather than pushed, on the page's own animation
frame. An event per frame across the boundary is the same traffic in a smaller
package.

## The view sits over the webview

A native view is not part of the page's stacking order, so one of the two has to
be on top and neither answer is free.

Underneath is the tempting one and it does not work. CSS transparency composites
down the element stack, not through the window: for the monitor to show through,
every ancestor of the stage would have to be transparent as well, up to `body`.

So the view is on top and **hidden** whenever the page has something to draw
over it — a sheet, an open menu. One rule, and it costs nothing at the moment
that matters: nobody has the settings sheet open while they are watching
playback.

Everything platform specific is `src-tauri/src/viewport/`, and it is three
functions: make a view, place it, hide it. The swapchain, the compositing and
every decision about when to draw are the same code everywhere, so a Windows
build replaces that directory and nothing else.

## The live and exact split is gone

There used to be two pictures: stacked media elements while playing, and a
composited frame drawn over them when the playhead stopped, with a badge saying
which was on screen. They were two implementations of the same timeline and the
badge existed because they did not agree.

On the native monitor there is one. The frame under a stopped playhead and the
frames during playback are the same compositor, the same shader and the same
surface — the only difference is where the source frames come from, which is
invisible. So the badge is hidden and the exact frame is not asked for.

On the media element fallback both are still there, unchanged.

## Falling back is a supported answer

`fallback::choose` takes the setting and whether the native engine actually
started. A machine with no graphics adapter, a platform with no viewport layer,
a window that offers no surface format anybody can draw in: each is a reason
string, and each ends with the media element preview running and Settings saying
why.

Playback is the app's main path. An editor that will not play is not an editor,
and a machine where this does not work should get the preview the app has always
had rather than a black rectangle.

One distinction the code makes and a shorter version would not: choosing the
media element engine is **not** a fallback and reports nothing. A preference is
not a failure, and warning somebody about their own setting is worse than saying
nothing.

## Judging it

`cargo run -p makevideo-present --bin present-soak` plays a real project with no
window and exits non-zero when a scenario misses its limits. It measures A/V
drift first — how far the frame on screen is from the sound — because that is
the failure only this layer can have. The metrics, the thresholds and the
numbers measured so far are in [quality/README.md](../../quality/README.md).

The acceptance is that harness and nothing else. Concurrency and timing faults
do not converge under somebody watching a screen: the failure is intermittent,
the observer is unreliable, and every fix looks like it worked. Three of the
bugs described on this page were found by the meter and none of them would have
been found by looking.

## Testing without a window

`OffscreenSink` draws through the same `draw_onto` the swapchain uses, into a
texture it keeps, and then waits for the device. What is missing against the app
is one `present` call; what is there is all of the timing and all of the
drawing.

The scheduler's own tests run against a fake reader and a clock the test parks
where it likes, so "the clock is ten frames ahead of the source" is a line of
code rather than a machine under load.
