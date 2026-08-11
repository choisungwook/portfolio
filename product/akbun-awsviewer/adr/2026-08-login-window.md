# Device authorization in an app window

> The flow this describes is superseded by [2026-08-cli-login-relay.md](./2026-08-cli-login-relay.md): `aws sso login` runs the device flow now. The window decision below still holds — the relay opens the CLI's verification URL in that same window.

## Decision

The browser-interactive step of the SSO device flow opens in a dedicated Tauri window (label sso-login) pointed at the verification URL, instead of the OS default browser. The login command polls for the token while that window exists; closing the window cancels the flow.

## Reason

Opening the system browser drops the user into another app with no way for this one to know whether they finished, gave up, or never saw the tab; the dialog window keeps approve-or-cancel observable (the poll loop checks the window handle) and the flow feels like one operation. The window is deliberately absent from capabilities, so the remote identity page it renders has no IPC into the app.
