# akbun-awsviewer wiki

Read this before changing the app.

- [architecture.md](./architecture.md) — process structure, the command surface, and the login flow
- [development.md](./development.md) — build, run, test, release, and the caveats that bite

## What it is

A read-only AWS viewer for macOS. The user picks a profile parsed from ~/.aws/config, signs in through IAM Identity Center (the app runs `aws sso login` and relays its browser step into a separate window), and browses EC2 instances with console-style detail tabs. Access keys are never read and no mutating API exists in the codebase.

## Ground rules

- Everything that talks to AWS lives in workspace/src-tauri/crates/core (awsviewer-core), which does not depend on tauri. CI tests only that crate plus the page logic.
- Only list/describe calls. Adding any mutating AWS call is out of scope for this product.
- The token cache is shared with the AWS CLI (~/.aws/sso/cache, same file naming and format). Do not invent a private session store.
- Logging in means running the AWS CLI. The app does not talk to SSO OIDC itself; do not add a second login path beside it.
