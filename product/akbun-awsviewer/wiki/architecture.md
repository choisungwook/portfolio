# Architecture

## Process structure

```text
page (src/, plain HTML/CSS/JS, no bundler)
  └─ invoke() ──► commands.rs (thin wrappers, one per page action)
                    ├─ clilogin.rs  spawns `aws sso login`, relays its browser step
                    └─ awsviewer-core (crates/core, no tauri dependency)
                         ├─ profiles.rs   parse ~/.aws/config
                         ├─ ssocache.rs   ~/.aws/sso/cache read/write, CLI-compatible
                         ├─ awscli.rs     `aws sso login` arguments and output parsing
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
| cli_login | runs `aws sso login` for the selected profile, opens the sign-in window, resolves when the CLI exits |
| reopen_login_window | reopens the sign-in window of the login in flight |
| cancel_login | closes that window, which cancels the login |
| list_instances | DescribeInstances for the selected profile's region |
| instance_detail | one instance joined with its volumes and security groups |
| open_log_dir | reveals the error log folder in Finder |

Errors cross the boundary as `{ kind, message }`. The page treats `login_required` as "show the login hint", not as an error dump.

api.js loads first and registers window `error`/`unhandledrejection` hooks before anything that can fail; together with the log plugin they append every uncaught page error — including a parse error in a later script — to a file under app_log_dir (~/Library/Logs/io.akbun.awsviewer). A log that has the startup line but no page errors and still misbehaves points at the webview, not the backend.

## Login flow

The AWS login button in the topbar opens a profile picker dialog listing the SSO-capable profiles. Picking one selects it and, when the cached session is not already valid, starts this flow. The AWS Profile tab is a read-only listing.

The app does not run the device authorization flow itself any more. `aws sso login` runs it and this app relays the browser step; the reasoning is in [the CLI relay ADR](../adr/2026-08-cli-login-relay.md).

1. `cli_login` resolves the `aws` binary and spawns `aws sso login --profile <selected> --no-browser`. Both pipes are drained by reader threads into one buffer, because a full pipe blocks the child and the URL has moved between stdout and stderr across CLI versions.
2. `awscli::parse_verification` reads the first https URL and the first `ABCD-EFGH` shaped code out of that buffer. It matches shapes, not sentences, because the wording around them differs by CLI version.
3. The URL opens in a separate `sso-login` window and the same URL and code go to the page as an `aws-login-verification` event, which opens the modal. That window is not in capabilities/default.json, so the remote identity page gets no IPC.
4. The task polls until the CLI exits. Closing the sign-in window kills the CLI, which is how cancel works — the modal's Cancel button closes that window rather than signalling separately.
5. The CLI writes ~/.aws/sso/cache itself, in the format ssocache.rs already reads — file name sha1(session name) for sso-session configs, sha1(start URL) for legacy ones. There is nothing to save on success; the session is read back the way any other session is.
6. Role credentials come from GetRoleCredentials per profile and are memoized in AppState until shortly before expiry.

Two details are easy to break. Windows must be built on the main thread on macOS, and the login task is a blocking one, so `open_login_window` hands the build to `run_on_main_thread`. That build is queued rather than immediate, so "the window is gone" only means cancelled after the window has been seen once — a plain `is_some()` check reads the gap before it opens as a cancelled login.

The `aws` binary is looked up in /usr/local/bin and /opt/homebrew/bin before PATH. A bundled macOS app inherits a minimal PATH containing neither, so a PATH-only lookup finds nothing in a release build even though the same command works in the user's terminal.

## Instance columns

Capacity and Karpenter are derived in ec2.rs, not in the page.

- Capacity is spot or on-demand. `DescribeInstances` omits `instanceLifecycle` for on-demand instances, so absence is the answer rather than missing data; other values (capacity-block) are shown as they come. The Spot only filter reads this same field, so the column and the filter cannot disagree about what absence means.
- Karpenter is the NodePool from the `karpenter.sh/nodepool` tag, falling back to the pre-v1beta1 `karpenter.sh/provisioner-name`. Empty for anything Karpenter did not launch.

## Read-only by construction

ec2.rs is the only module holding an EC2 client and it exposes exactly `list_instances` and `instance_detail`. There is no code path that constructs any other AWS service client, so the app cannot mutate anything even by accident.

## Skip-TLS-verify option

Settings has one toggle (default off) for networks where a proxy resigns HTTPS. The modern smithy connector only accepts trust stores, so http.rs builds the insecure client on the SDK's legacy hyper 0.14 path (`hyper-014` feature) with a rustls verifier that accepts everything. The toggle routes every SDK client through that one constructor; nothing else may use it.
