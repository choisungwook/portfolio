# akbun-awsviewer

macOS desktop viewer for AWS resources. Pick a profile from ~/.aws/config and use credentials created by `aws login` in a terminal. Browse EC2 instances and the latest 20 CloudTrail events read-only.

Login needs an AWS CLI version that provides `aws login` and `aws configure export-credentials`.

The app does not implement or launch authentication. It asks the AWS CLI to export the selected profile's resolved credentials and calls only read APIs through the official AWS SDK for Rust.

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
