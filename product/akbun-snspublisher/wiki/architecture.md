# Architecture

One Worker, one D1 database, one Access-protected hostname for the app. Images will live on a second, public hostname because the Meta APIs fetch them by URL.

## Components

| Component | Role | Status |
| --- | --- | --- |
| Worker `worker/index.ts` | Serves `/api/*`; everything else falls through to the assets binding | Health and me only |
| Assets `src/` | Plain HTML, CSS, and JavaScript. No bundler, so the source is what runs | Three screens on mock data |
| D1 | API tokens now; drafts, channel tokens, and publish attempts later | Token table only |
| Cloudflare Access | Google login in front of the hostname, one allowed account | Not configured |
| Cron Trigger | Wakes the Worker to publish due posts | Planned |
| R2 public bucket | Image hosting on a public hostname for Threads and Instagram | Planned |

## Authentication, two paths

Same code as akbun-reader (`worker/auth.ts`).

| Path | Who | Verified by |
| --- | --- | --- |
| Browser | The web page | Access issues a JWT after Google login; the Worker checks its signature, audience, and subject |
| Automation | CLI, MCP client | `Authorization: Bearer` token, stored in D1 as a hash |

Both paths end in Worker code. `workers_dev` and `preview_urls` are off so no hostname bypasses Access. Channel OAuth callbacks arrive through the browser, so they carry the Access cookie and need no bypass.

## Screens

| Screen | Hash | What it shows |
| --- | --- | --- |
| Compose | `#compose` | One shared body, a checkbox per channel, remaining characters per channel from `src/channels.js` |
| Queue | `#queue` | Posts ordered by `queueOrder`: scheduled first by time, undated drafts last. One pill per channel state |
| Calendar | `#calendar` | Six-week Monday-first grid from `monthGrid`, posts placed by their local day |

Routing is the URL hash. `src/app.js` builds every element with `document.createElement`; there is no HTML string interpolation, so post bodies never become markup.

## Data rules that already hold

- Channel limits are a data table (`src/channels.js`), not code branches. Adding a channel is one row.
- Times are stored in UTC and converted only for display (`dayKey` takes a time zone).
- A post's overall status is its worst channel state: failed, then publishing, scheduled, draft, published.

## Not built yet

Drafts in D1, per-channel overrides, rule validation, the scheduler, channel OAuth, image upload, and the actual publish adapters. The root issue tracks the order.
