# Sign in by relaying `aws sso login`

> Superseded by [2026-08-aws-cli-login.md](./2026-08-aws-cli-login.md).

## Decision

The app no longer runs the SSO OIDC device authorization flow itself. `cli_login` spawns `aws sso login --profile <selected> --no-browser`, reads the verification URL and code out of the CLI's output, opens that URL in the same `sso-login` window as before, shows the URL and code in a modal on the page, and resolves when the CLI exits. Closing the sign-in window kills the CLI, which is still how the flow is cancelled. login.rs and the aws-sdk-ssooidc dependency are gone.

This supersedes the flow half of [2026-08-login-window.md](./2026-08-login-window.md). Its actual decision — that the browser-interactive step belongs in an app window rather than the OS browser — is unchanged and is why the relay exists at all.

## Reason

The in-app flow registered a fresh public OIDC client on every login and did not work in practice, leaving nothing to act on but an AWS error string; the AWS CLI runs the same flow, is already trusted by the same Identity Center instance, and already writes the ~/.aws/sso/cache file this app reads, so relaying it removes the app's own login code instead of debugging a second implementation of it.

- Only the CLI's output shape is now the app's problem, and that is text: `awscli.rs` has no process and no network, so every version's wording is a unit test rather than something you can only find out by signing in.
