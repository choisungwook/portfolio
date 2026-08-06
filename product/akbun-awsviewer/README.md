# akbun-awsviewer

macOS desktop viewer for AWS resources. Pick a profile from ~/.aws/config, sign in with IAM Identity Center in a dialog window, and browse EC2 instances read-only — list, filter by id or Name tag, and open console-style Details / Network / Storage / Security tabs.

No access keys: the app reads no ~/.aws/credentials and calls only list/describe APIs through the official AWS SDK for Rust.

## Directory

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Source code: plain HTML/CSS/JS page, Tauri shell, and the awsviewer-core crate |
| [wiki/](./wiki/) | What the next agent reads before taking over |
| [adr/](./adr/) | Decision records |

## Quick start

Run the app in development mode from workspace/:

```bash
npm install
npm start
```

Run the tests (no app binary needed):

```bash
npm test
npm run test:rust
```
