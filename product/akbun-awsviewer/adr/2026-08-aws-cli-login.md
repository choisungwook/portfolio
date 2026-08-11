# Keep AWS login in the terminal

## Decision

The app does not start or embed `aws login`. Users authenticate in a terminal. The app resolves the selected profile with `aws configure export-credentials --format process` and shows only logged-in or logged-out status.

## Reason

`aws login` owns an interactive OAuth flow that may prompt for region, account changes, browser callbacks, or remote authorization codes. Relaying part of that interaction into a webview creates a second terminal implementation and changes CLI semantics. Exporting resolved credentials preserves AWS CLI profile precedence and refresh behavior without storing another credential cache.
