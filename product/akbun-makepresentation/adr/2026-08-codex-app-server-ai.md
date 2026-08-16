# Reuse Codex ChatGPT authentication but keep AI conversations app-owned

## Decision

Start the user's separately installed `codex app-server` as a JSONL stdio child process. Accept only its ChatGPT authentication state, do not bundle Codex or copy OAuth credentials, and do not provide API key authentication.

Use ephemeral App Server threads with external tools disabled. Persist at most three app-owned conversation directories under the Tauri app data directory, with a 128 MiB limit per directory including generated images. Closed and restored sessions are read-only.

## Reason

The App Server is the supported programmatic interface for reusing the Codex CLI's ChatGPT login. Reading or copying private token files would couple the app to an undocumented credential format and increase credential exposure.

Ephemeral threads make Codex CLI/Desktop history, cleanup, and capacity independent from the presentation app. App-owned storage can enforce the product's exact retention rules and delete image assets atomically with their conversation.

Slide output is a validated structured patch applied to a clone after the source slide. Image output is copied into the session and inserted only after an explicit user action. Both choices preserve the presentation as the recovery boundary.

## References

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Image generation](https://learn.chatgpt.com/docs/image-generation)
