# akbun-awsviewer

macOS desktop viewer for AWS resources. Pick a profile from ~/.aws/config in the AWS login dialog, sign in with IAM Identity Center — the app runs `aws sso login` for that profile and relays its browser step into an app window — and browse EC2 instances read-only: list with Capacity (spot / on-demand), Karpenter NodePool and Age columns, filter by id, Name tag, or spot only, and open console-style Details / Network / Storage / Security tabs.

Login needs AWS CLI v2 (2.9 or newer) installed.

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
