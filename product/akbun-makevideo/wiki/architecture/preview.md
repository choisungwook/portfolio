# The media element preview

The fallback engine, and what the app played with before the [program
monitor](./viewport.md) existed. It runs when Settings asks for it, when the
native monitor cannot start on this machine, and — always — when a single
imported asset is being previewed rather than the timeline.

`src/monitor.js` is what decides which of the two is driving. Everything below
describes this one.

`src/preview.js` keeps one media element per clip in a pool and stacks them in `#stage-inner`:

1. Playback starts after the active reference media element has started playing.
2. The reference element's `currentTime` drives the playhead. Gaps and still-only sections fall back to `performance.now()`.
3. `clipsAt()` says which clips are live at that instant.
4. Each live follower is shown, given a z-index from its track, and synchronized with small `playbackRate` changes.
5. A follower seeks only when it is at least one second from the reference.
6. Everything not live is hidden and paused.

This is not the render. The differences are real and worth knowing:

- The preview composites with CSS `object-fit: contain` and `opacity`; the render composites with `scale`, `pad` and `overlay`. They agree on framing and z-order, and they will not agree on colour management.
- The preview does not mix audio; it plays several elements at once and lets the system add them up. The render uses `amix` with `normalize=0`.
- The preview cannot honour a frame rate. It shows whatever the element decodes.

Anything that looks wrong **during playback** should be checked against the exact frame before it is called a bug.

That exact frame is the other half of this engine: when the playhead stops, the page asks Rust for the frame the render would produce and draws it over the stack, with a badge saying which of the two is on screen. It is the same compositor, the same shader and the same geometry the render uses, so it is not an approximation of anything. See [compositor.md](./compositor.md).

**Neither half runs on the native monitor.** There the frame under a stopped playhead and the frames during playback come out of one compositor onto one surface, so there is nothing for a second path to draw and nothing for a badge to tell apart. The exact frame is not asked for and the badge stays hidden.

## Preview quality

Set in Settings and defaulted to **Half**. It changes the layout scale:

| Setting | Layout scale |
|---|---|
| Full | 1 |
| Half | 0.5 |
| Quarter | 0.25 |

The stage box stays the same size on screen. `#stage-inner` is laid out at `scale` and transformed back up, so the browser composites a smaller surface. Lowering the quality does **not** make the decoder do less work, because the element still decodes its source at full resolution.

## Playback proxies

- 동영상 장변이 1920px보다 크면 프로젝트의 `proxies/` 폴더에 1280px 프록시 생성
- 생성 중 asset 행에 진행률 표시
- 준비 전 원본 재생, 준비 후 프록시 재생
- Playback → Proxy Media…에서 프록시 재생 사용 여부와 생성 상태 확인
- 원본 경로·수정 시각 불일치 시 재생성
- export와 정지 상태 exact frame은 원본 사용
