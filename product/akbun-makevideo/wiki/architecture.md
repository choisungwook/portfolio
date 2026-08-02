# Architecture

## Processes

One Tauri window. There is no node runtime and no bundler; `src/` is served as it is, so the source that runs is the source in the repository.

| Side | Owns |
|---|---|
| The page (`src/`) | The project model, the timeline UI, the preview clock, every keystroke |
| Rust (`src-tauri/src/`) | The file system, ffprobe, ffmpeg, application settings, the asset protocol scope |
| The render crate (`src-tauri/crates/render/`) | The project as serde types, the ffmpeg argument list, ffprobe output parsing, tool discovery |

The render crate depends on neither tauri nor anything that needs a webview, which is what lets the pull request job test it on Linux in seconds. Testing the app crate instead would mean installing GTK and WebKit on the runner.

## The project

One JSON object, written to a `.akbunvideo` file and read back by both sides.

```text
project
  settings { width, height, fps }          the editing canvas
  assets[] { id, path, name, kind,         kind is video | audio | image
             durationMs, width, height, hasAudio }
  tracks[] { id, kind, name, muted, hidden,
             clips[] { id, assetId, startMs, inMs, outMs, volume, opacity } }
```

- `startMs` is the position on the timeline. `inMs`/`outMs` are the span taken out of the source, so a clip's length is `outMs - inMs` and its end is `startMs + (outMs - inMs)`.
- An asset's `id` is a hash of its path, so importing the same file twice updates one row instead of adding a second, and a project reopened next week still points its clips at the same assets.
- Video tracks composite in array order: track 1 is the bottom layer. The timeline draws them reversed so V1 sits at the bottom of the screen, which is where every other editor puts it.
- `hidden` on a video track removes it from the preview, the render **and** the timeline length. `muted` silences a track but keeps its picture.

The page defines this shape; Rust reads it back through serde with `rename_all = "camelCase"`. Every clip field added later needs a `#[serde(default)]` on the Rust side or an older project file stops opening.

## Where the model lives, and why it is not in Rust

`src/timeline.js` holds all the arithmetic: placing, moving, trimming, splitting, snapping, and answering what is under the playhead. It has no DOM access, so `node --test` covers it.

It is in the page because a drag has to answer on the next frame. A round trip to Rust per mouse move would not keep up, and the model would then exist on both sides anyway. Rust reads the same shape for the render and the project file, so the two halves agree without either reimplementing the other.

The one rule that follows: **nothing in `timeline.js` may touch the DOM or `window.api`**, or the tests stop running.

## The preview is an approximation

`src/preview.js` keeps one media element per clip in a pool, stacks them in `#stage-inner`, and drives them from a clock:

1. A `requestAnimationFrame` loop computes the playhead from `performance.now()`.
2. `clipsAt()` says which clips are live at that instant.
3. Each live element is shown, given a z-index from its track, and seeked if it has drifted further than the current quality tolerance allows.
4. Everything not live is hidden and paused.

This is not the render. The differences are real and worth knowing:

- The preview composites with CSS `object-fit: contain` and `opacity`; the render composites with `scale`, `pad` and `overlay`. They agree on framing and z-order, and they will not agree on colour management.
- The preview does not mix audio; it plays several elements at once and lets the system add them up. The render uses `amix` with `normalize=0`.
- The preview cannot honour a frame rate. It shows whatever the element decodes.

Anything that looks wrong in the preview should be checked against a render before it is called a bug.

### Preview quality

Set in Settings and defaulted to **Half**. It changes two things:

| Setting | Layout scale | Drift tolerance |
|---|---|---|
| Full | 1 | 0.12 s |
| Half | 0.5 | 0.25 s |
| Quarter | 0.25 | 0.4 s |

The stage box stays the same size on screen. What changes is that `#stage-inner` is laid out at `scale` and transformed back up, so the browser composites a smaller surface, and how far an element may run from the playhead before it is seeked back. The second one matters more: seeking is the expensive operation, and a looser tolerance is most of the saving. Lowering the quality does **not** make the decoder do less work, because the element still decodes its source at full resolution.

## The render

`crates/render/src/ffmpeg.rs` builds the whole argument list. Shape:

```text
-hide_banner -nostdin -loglevel error -y
  (per clip)  -ss <in> -t <len> -i <path>          video and audio
              -loop 1 -framerate <fps> -t <len> -i <path>   stills
-filter_complex <graph>
-map [vout] [-map [aout]]
-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r <fps>
[-c:a aac -b:a 192k -ar 48000]
-t <total> -movflags +faststart -progress pipe:1 -nostats <output>
```

One input per clip rather than per asset. That costs an extra decoder when the same file is used twice, and buys input level seeking (`-ss` before `-i`, so ffmpeg skips to the in point instead of decoding everything before it) and a uniform way to give a still a length.

The graph:

```text
color=c=black:s=WxH:r=FPS:d=TOTAL[base]

per video clip:
  [N:v]format=yuva420p,
       scale=W:H:force_original_aspect_ratio=decrease,
       pad=W:H:(ow-iw)/2:(oh-ih)/2:color=black@0,
       fps=FPS,setpts=PTS-STARTPTS[,colorchannelmixer=aa=OPACITY],
       tpad=start_duration=START:start_mode=add:color=black@0[vN]
  [prev][vN]overlay=x=0:y=0:eof_action=pass:enable='between(t,START,END)'[ovK]

per audio clip:
  [N:a]aformat=fltp:48000:stereo,asetpts=PTS-STARTPTS,
       volume=VOL,adelay=STARTMS:all=1[aN]
  [a0][a1]…amix=inputs=N:normalize=0:dropout_transition=0[aout]
```

Four details in there are load bearing:

- **`format=yuva420p` and `color=black@0` in the pad.** An off-aspect clip is letterboxed to the output size. With an opaque pad those bars would paint over the track underneath. With a transparent one the lower track shows through, which is what the timeline says should happen.
- **`tpad` rather than a bare `setpts` offset.** `overlay` pairs frames from both inputs; if the second one has no frames until five seconds in, framesync has nothing to pair and the graph can stall. `tpad` gives it transparent frames from zero so both inputs run from the start.
- **`enable='between(...)'`** is belt and braces on top of `tpad`, and is also what hides the clip again after its end. Commas inside the quoted expression are safe because the whole graph is one argv element.
- **`eof_action=pass`** lets the base through once a clip ends, instead of holding its last frame for the rest of the render.

Progress comes back on stdout as `-progress` blocks. The parser reads `out_time_us` and ignores `out_time_ms`, which ffmpeg has reported in microseconds for years; reading it as milliseconds puts the bar at 1000x and the render looks finished a second in.

### Render presets

FHD and 4K set the **long edge**, 1920 and 3840, and the project aspect decides the other side. A 1080x1920 project therefore renders 1080x1920 at FHD rather than a landscape frame with a stripe of video down the middle. Both derived sizes are rounded to even numbers because h264 requires it.

## The IPC surface

Every command is in `src-tauri/src/commands.rs`. The page picks paths with native dialogs and hands them over, so nothing here blocks on UI.

| Command | What it does |
|---|---|
| `bootstrap` | Settings, app version, config dir, and where ffmpeg and ffprobe were found |
| `save_settings` | Persists, applies the window theme, returns a fresh bootstrap |
| `import_assets` | Filters by extension, grants the asset protocol scope, probes with ffprobe |
| `open_project` / `save_project` | Reads and writes the project file; opening re-grants the scope for every asset |
| `start_render` | Spawns ffmpeg, returns immediately, emits `render:progress` then one `render:done` |
| `cancel_render` | Kills the running ffmpeg |

### The asset protocol

Local media cannot be loaded with `file://`. It goes through `convertFileSrc()` and the asset protocol, which needs all four of: the `protocol-asset` cargo feature, `assetProtocol.enable`, `img-src` **and** `media-src` in the CSP, and a runtime scope grant.

The scope grant lives in memory only. Every path is granted per file in `import_assets` and again in `open_project`, because a project opened in a new run has granted nothing and every preview would be blank with no error anywhere.

## Key flows

**Dropping files from Finder.** Tauri intercepts the OS drop, so HTML5 drop events never fire for external files. `onDragDropEvent` gives paths and a position in *physical* pixels; the page divides by `devicePixelRatio` and asks `elementFromPoint` which lane it landed on. Tauri has been known to deliver one drop as two events, so `api.js` drops a repeat of the same paths within 400 ms — otherwise every clip would be added twice.

**Dragging inside the page.** Asset panel to lane uses HTML5 drag and drop. Moving and trimming clips uses pointer events instead, because they need live feedback: the drag updates only the element's style, and the model is changed once on release.

**A file ffprobe could not measure** comes back with `durationMs: 0`. The page fills it in from the media element's `loadedmetadata`, so the app works with no ffmpeg installed right up to the point of rendering.
