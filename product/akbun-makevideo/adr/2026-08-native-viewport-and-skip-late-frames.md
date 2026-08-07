# The monitor draws on a native surface, and a late frame is skipped

## Decision

Replace the viewport with a native surface the compositor draws straight onto, and leave the rest of the app where it is. The core stays Rust behind a webview, the UI stays a plain page, and the only thing that becomes native is the rectangle the picture is in.

Send no video frame across the IPC boundary. The page sends transport commands and reads back a position; the picture goes from the frame source to the compositor to the window's own swapchain without being serialised once.

Decide when to show a frame against the audio clock, and **skip** a frame the clock is already past rather than drawing it. Never send a decoder backwards. Past a threshold, jump the source forward to the clock instead of walking to it.

Put the decision in a pure function over two frame numbers and test every boundary of it, so the part that can be reasoned about is separated from the part that needs a machine.

Isolate making a view, placing it and hiding it in a platform directory of its own, and put the view over the webview rather than under it, hidden whenever the page draws over the stage.

Keep the media element preview as a setting and fall back to it automatically when the native engine cannot start, with the reason shown.

Judge the result by the numbers a headless harness reports and by nothing else.

Remove the live and exact frame split once this lands.

## Why

- The stack proposed for a rewrite already exists in Rust in a form this app has tested, so changing language or GUI toolkit would buy no capability and would cost a working compositor, a shader with a two-backend agreement test, and every keystroke of the editor.
- Moving a frame across IPC costs a serialise and a copy per frame — about 250 MB a second at 1080p30 — which is more than the whole real time budget, so the boundary has to carry commands and never pictures.
- Drawing a frame that is already late costs the same decode as skipping it and leaves the picture behind the sound as well, and every frame after it inherits the lateness; asking a decoder to go back to catch up is the stall this stage exists to remove.
- Timing faults do not reproduce, so anything that can be decided without a clock, a thread or a graphics device is worth deciding in a function a test can sweep exhaustively.
- wgpu and ffmpeg already run on both platforms and every decision about when to draw is platform independent, so a Windows build should be one directory of view handling rather than a second playback engine.
- A native view is not in the page's stacking order and CSS transparency composites down the element stack rather than through the window, so putting the view underneath would mean making every ancestor of the stage transparent up to the body; on top with one rule about hiding it is a smaller contract than a transparent window.
- Playback is the app's main path, so an engine that dies on somebody's machine has to leave them with an editor rather than with a black rectangle, and the reason has to be visible or the bug report says only that playback stopped working.
- Concurrency and timing defects do not converge under a person watching a screen: the failure is intermittent, the observer is unreliable, and every attempted fix looks like it worked. The three defects this stage actually had — a stall at the end of every timeline, a stall on the second seek of any session, and a harness that could run for minutes past its own subject — were all found by the meter and none of them by looking.
- The badge existed because the preview and the render were two implementations that could not agree; once both come out of one compositor onto one surface there is nothing left for it to tell apart.
