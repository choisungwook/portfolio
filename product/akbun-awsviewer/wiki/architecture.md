# Architecture

## Process structure

```text
page (src/, plain HTML/CSS/JS, no bundler)
  └─ invoke() ──► commands.rs (thin wrappers, one per page action)
                    └─ awsviewer-core (crates/core, no tauri dependency)
                         ├─ profiles.rs   parse ~/.aws/config
                         ├─ ssocache.rs   ~/.aws/sso/cache read/write, CLI-compatible
                         ├─ login.rs      SSO OIDC device authorization flow
                         ├─ creds.rs      token → role credentials (GetRoleCredentials)
                         ├─ ec2.rs        DescribeInstances/Volumes/SecurityGroups → view model
                         └─ http.rs       optional skip-TLS-verify client
```

The page owns the instance array; filtering and sorting run in lib.js on every keystroke without touching the backend. Data changes only on Refresh, profile switch, and login.

## Command surface

| Command | Does |
|---|---|
| get_snapshot | profiles + settings + session status + version + log dir, one round trip |
| select_profile | persists the choice, clears the credential cache, returns a snapshot |
| set_insecure_tls | persists the TLS toggle, returns a snapshot |
| sso_login | whole device flow: opens the login window, polls, writes the token cache |
| list_instances | DescribeInstances for the selected profile's region |
| instance_detail | one instance joined with its volumes and security groups |
| open_log_dir | reveals the error log folder in Finder |

Errors cross the boundary as `{ kind, message }`. The page treats `login_required` as "show the login hint", not as an error dump.

api.js loads first and registers window `error`/`unhandledrejection` hooks before anything that can fail; together with the log plugin they append every uncaught page error — including a parse error in a later script — to a file under app_log_dir (~/Library/Logs/io.akbun.awsviewer). A log that has the startup line but no page errors and still misbehaves points at the webview, not the backend.

## Login flow

The AWS login button in the topbar opens a profile picker dialog listing the SSO-capable profiles. Picking one selects it and, when the cached session is not already valid, starts this flow. The AWS Profile tab is a read-only listing.

1. `sso_login` registers a public OIDC client and starts device authorization (both unsigned calls, this is how a client without credentials gets its first token).
2. The verification URL opens in a separate `sso-login` window. That window is not in capabilities/default.json, so the remote identity page gets no IPC.
3. The command polls CreateToken while the window exists; closing the window cancels the flow (the poll callback checks the window handle).
4. On approval the token is written to ~/.aws/sso/cache in the CLI's format — file name sha1(session name) for sso-session configs, sha1(start URL) for legacy ones — so app and CLI share sessions both ways.
5. Role credentials come from GetRoleCredentials per profile and are memoized in AppState until shortly before expiry.

## Read-only by construction

ec2.rs is the only module holding an EC2 client and it exposes exactly `list_instances` and `instance_detail`. There is no code path that constructs any other AWS service client, so the app cannot mutate anything even by accident.

## Skip-TLS-verify option

Settings has one toggle (default off) for networks where a proxy resigns HTTPS. The modern smithy connector only accepts trust stores, so http.rs builds the insecure client on the SDK's legacy hyper 0.14 path (`hyper-014` feature) with a rustls verifier that accepts everything. The toggle routes every SDK client through that one constructor; nothing else may use it.
