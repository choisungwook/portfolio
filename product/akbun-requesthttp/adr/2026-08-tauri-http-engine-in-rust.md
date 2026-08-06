# Tauri with a plain page; the HTTP engine runs in Rust

## Decision

The app is Tauri with a no-build-step HTML/JS page, reusing the structure of the existing Tauri products in this repository. Requests are performed by a Rust command (`send_request`, reqwest with rustls), never by the page itself.

## Reason

The two features that define this tool are impossible in a webview:

- A page can only `fetch` origins that opt in via CORS. An HTTP client must call arbitrary servers, so the request has to leave the webview.
- Turning TLS verification off — the escape hatch for TLS-inspecting networks and self-signed lab servers — does not exist in any browser API. reqwest exposes it as `danger_accept_invalid_certs`, one builder flag away once the request runs in Rust.

rustls instead of the platform TLS keeps the build free of system OpenSSL on every OS, and the flag works the same there.

Tauri over Electron follows the repository default: the installer stays under 10 MB, the page is ordinary HTML/CSS/JS, and the release action produces installer, signature and update manifest in one step. Nothing here needs a tray, a node-only library, or an immediate multi-platform build.
