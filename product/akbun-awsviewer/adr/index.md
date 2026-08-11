# Decision records

- [2026-08-sso-only-auth.md](./2026-08-sso-only-auth.md) — IAM Identity Center only, no access keys
- [2026-08-read-only-by-construction.md](./2026-08-read-only-by-construction.md) — the read-only guarantee is structural, not a convention
- [2026-08-login-window.md](./2026-08-login-window.md) — device authorization in an app window, not the external browser (flow superseded by the CLI relay)
- [2026-08-cli-login-relay.md](./2026-08-cli-login-relay.md) — sign in by relaying `aws sso login` instead of running the device flow in-app
- [2026-08-insecure-tls-legacy-hyper.md](./2026-08-insecure-tls-legacy-hyper.md) — the skip-TLS-verify client rides the SDK's legacy hyper path
