# akbun-awsviewer wiki

Read this before changing the app.

- [architecture.md](./architecture.md) — process structure, the command surface, and the login flow
- [development.md](./development.md) — build, run, test, release, and the caveats that bite

## What it is

A read-only AWS viewer for macOS. The user picks a profile parsed from ~/.aws/config, logs in with `aws login` in a terminal, and browses EC2 instances and CloudTrail events.

## Ground rules

- Everything that talks to AWS lives in workspace/src-tauri/crates/core (awsviewer-core), which does not depend on tauri. CI tests only that crate plus the page logic.
- Only list/describe calls. Adding any mutating AWS call is out of scope for this product.
- Credentials come from `aws configure export-credentials`; do not read or implement a credential cache.
- Authentication stays in the terminal; do not add an in-app login path.
