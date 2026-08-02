# The timeline model

`src/timeline.js` holds all the arithmetic: placing, moving, trimming, splitting, snapping, and answering what is under the playhead. It has no DOM access, so `node --test` covers it.

It is in the page because a drag has to answer on the next frame. A round trip to Rust per mouse move would not keep up, and the model would then exist on both sides anyway. Rust reads the same shape for the render and the project file, so the two halves agree without either reimplementing the other.

The one rule that follows: **nothing in `timeline.js` may touch the DOM or `window.api`**, or the tests stop running.
