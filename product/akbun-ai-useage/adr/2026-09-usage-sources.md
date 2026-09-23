# Local logs first, APIs only where needed

## Decision

- Claude Code and Codex tokens are summed from their local JSONL logs.
- Codex limits come from the same logs. Claude limits come from the OAuth usage endpoint, opt-in.
- Kiro comes from `kiro-cli chat /usage`.
- Organization usage and cost come from the Anthropic and OpenAI Admin APIs when an admin key is set.
- Local tokens carry no cost estimate.

## Reason

- Local logs need no login, work offline, and cover every plan because the CLI writes them whatever account it uses.
- Codex already writes its rate limits into the log, so no token is touched. Claude keeps limits on the server only, and reading them reuses the Claude Code login token. Anthropic restricts third party use of subscription auth, so the call is off until the user turns it on.
- Kiro has no local log and no public usage API. The CLI card is the only machine-readable source, and a parser failure shows as an error line instead of a wrong number.
- Enterprise and API usage from other members and machines never touches local logs. The Admin APIs are the only complete view, and they need an admin key a regular key cannot replace.
- Pricing tables change often and differ per plan. A subscription user pays a flat fee, so a per-token cost would mislead. Real cost comes from the Admin APIs.
