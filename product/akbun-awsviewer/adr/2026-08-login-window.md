# Device authorization in an app window

> Superseded by [2026-08-aws-cli-login.md](./2026-08-aws-cli-login.md). The app no longer owns a login window.

## Decision

The browser-interactive step of the SSO device flow opens in a dedicated Tauri window (label sso-login) pointed at the verification URL, instead of the OS default browser. The login command polls for the token while that window exists; closing the window cancels the flow.

## Reason

Opening the system browser drops the user into another app with no way for this one to know whether they finished, gave up, or never saw the tab; the dialog window keeps approve-or-cancel observable (the poll loop checks the window handle) and the flow feels like one operation. The window is deliberately absent from capabilities, so the remote identity page it renders has no IPC into the app.
