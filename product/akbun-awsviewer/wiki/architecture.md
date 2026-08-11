# Architecture

## Process structure

```text
page (src/, plain HTML/CSS/JS)
  └─ invoke() ──► commands.rs
                    ├─ awscli.rs  exports selected-profile credentials
                    └─ awsviewer-core (no tauri dependency)
                         ├─ profiles.rs    parse ~/.aws/config
                         ├─ awscli.rs      export arguments and JSON parsing
                         ├─ ec2.rs         read-only EC2 queries
                         ├─ cloudtrail.rs  read-only LookupEvents
                         └─ http.rs        optional skip-TLS-verify client
```

## Authentication

- Login runs only in a user terminal: `aws login --profile <name>`.
- The app has no login button, authentication modal, or browser window.
- Session status calls `aws configure export-credentials --profile <name> --format process`.
- AWS requests use the exported short-lived credentials.
- Refreshing Instances or CloudTrail updates the top status badge.

## Command surface

| Command | Does |
|---|---|
| get_snapshot | Profiles, settings, CLI session status, version, log directory |
| select_profile | Persist selected profile and return a snapshot |
| set_insecure_tls | Persist TLS setting and return a snapshot |
| list_instances | DescribeInstances for the selected profile region |
| instance_detail | Describe one instance, volumes, and security groups |
| list_cloudtrail_events | LookupEvents, at most 20, optional EventName filter |
| open_log_dir | Reveal the error log directory |

## Page-owned state

- Instance text, capacity filtering, and column sorting run locally.
- CloudTrail EventName filtering runs in LookupEvents.
- CloudTrail rows are ordered newest first.

## Read-only boundary

- ec2.rs exposes list and describe operations only.
- cloudtrail.rs exposes LookupEvents only.
- No mutating AWS client call exists.
