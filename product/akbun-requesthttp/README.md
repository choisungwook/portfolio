# akbun-requesthttp

Desktop HTTP client for calling and checking APIs by hand: compose an HTTP(S) request, send it, inspect the response, and keep the requests worth keeping. Built on Tauri with a plain HTML/JS page, so there is no build step. The same page also deploys to a Cloudflare Worker as a web version.

## What it does

- Send HTTP(S) requests: method, URL, headers, body
- Response view: status, elapsed time, size, headers, body with JSON pretty print
- Save, duplicate, and reload requests from the sidebar
- Global variables shared across requests and local variables scoped to one request
- curl both ways: copy the current request as a curl command, or paste a curl command to fill the editor
- Scenario runs: chain saved requests in order, assert status and body content per step, and extract JSON values into variables for later steps
- Settings window: TLS certificate verification on/off, timeout, redirect following, updates
- Turning TLS verification off exists for networks where HTTPS inspection or self-signed certificates make verification impossible; it is desktop-only
- Self update from Settings (desktop)
- No accounts, no sync, no sharing: everything stays on the machine

## Desktop and web

| | Desktop (Tauri) | Web (Cloudflare Worker) |
|---|---|---|
| HTTP engine | Rust (reqwest), no CORS limits | Worker-side fetch via `/api/proxy` |
| TLS verification off | Yes, from Settings | Not possible |
| Storage | JSON file in the app data directory | localStorage |
| Update | Self update from Settings | Always the deployed version |

## Directory layout

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Source code: the page in src/, the Tauri shell in src-tauri/, the worker in worker/ |
| [wiki/](./wiki/) | What the next agent reads before taking over |
| [adr/](./adr/) | Decision records |

## Quick start

Run the desktop app in development (needs Rust and Node):

```bash
cd workspace
npm install
npm start
```

Run the tests, which need no app binary:

```bash
npm test
```

Run the web version locally:

```bash
npm run web
```

Build the installable desktop app:

```bash
npm run dist
```
