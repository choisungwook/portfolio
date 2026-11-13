# Feature map

What a user can see and act on, by the name this wiki uses for it. Use these names in requests and reviews so nobody has to guess which panel is meant. Selectors are from `workspace/src/index.html`; the lists inside them are rendered by `workspace/src/ui.js`.

| Name | Selector | What it does |
|---|---|---|
| Settings button | `#settings` | Opens AI and token settings |
| Notice | `#notice` | Status line for saves and errors |
| Location nav | `#locations`, `#location-bar` | Switches between 받은 글 (inbox), 나중에 (later) and 보관한 글 (archive). `#location-bar` is the same nav for narrow screens |
| Section nav | `#sections` | Opens RSS, 태그 and 공개 링크 management |
| Tag filter | `#tag-filter` | Narrows the current location to one tag |
| Save form | `#save-form` | Saves a URL with an optional title and comma-separated tags |
| Main | `#main` | The document list for the current location, or the reading view, or a section page |

## Checking the page

`workspace/src` is plain HTML and JS, so a static server shows the shell. Every list comes from `/api/*`, which a static server does not have, so the script reports those requests as 404. That is expected for the shell; use `npm run dev` (wrangler) and pass its URL to check real data.

Open the shell headless and list its console errors and controls:

```bash
node .claude/scripts/verify-page.mjs product/akbun-reader/workspace/src --out /tmp/reader
```
