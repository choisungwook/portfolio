---
name: youtube-likes-slack
description: "Manage YouTube liked videos weekly digest automation to Slack/Email. Fetches liked videos from multiple Google accounts via YouTube Data API v3 and sends weekly digest notifications. Use when the user mentions: youtube likes, youtube automation, liked videos digest, youtube slack, youtube email notification, or wants to set up/configure/troubleshoot/extend the YouTube likes automation pipeline."
---

# YouTube Likes → Slack/Email Automation

Fetch liked videos from multiple Google accounts via YouTube Data API v3, send weekly digest to Slack or Email.

## Project Structure

```
youtube-likes-automation/
├── scripts/
│   ├── fetch_likes.py       # Main: fetch likes → send Slack/Email
│   └── setup_oauth.py       # OAuth2 refresh token setup helper
├── config.env.example        # Environment variable template
└── requirements.txt

.github/workflows/youtube-likes-digest.yml   # Weekly cron (Mon 09:00 KST)
```

## Architecture

```
[Google Account 1] ──┐
[Google Account 2] ──┤── YouTube Data API v3 ──> fetch_likes.py ──> Slack Webhook
[Google Account N] ──┘                                          └──> Email (SMTP)
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID (Desktop App type) |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret |
| `GOOGLE_ACCOUNTS_JSON` | JSON array: `[{"label":"personal","refresh_token":"1//xxx"}]` |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `EMAIL_ENABLED` | `false` | Enable email notification |
| `EMAIL_FROM` / `EMAIL_TO` / `EMAIL_PASSWORD` | — | SMTP credentials (Gmail: use App Password) |
| `DAYS_LOOKBACK` | `7` | Days to look back |
| `MAX_RESULTS_PER_ACCOUNT` | `50` | Max videos per account |

### GitHub Actions Secrets

Prefix with `YT_`: `YT_GOOGLE_CLIENT_ID`, `YT_GOOGLE_CLIENT_SECRET`, `YT_GOOGLE_ACCOUNTS_JSON`, `YT_SLACK_WEBHOOK_URL`

## Key Commands

```bash
# Get refresh tokens for each Google account (opens browser)
python scripts/setup_oauth.py

# Test without sending notifications
python scripts/fetch_likes.py --dry-run

# Fetch last 3 days, save to JSON
python scripts/fetch_likes.py --days 3 --output-json result.json

# Send actual Slack/Email notifications
python scripts/fetch_likes.py
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `403 Forbidden` | YouTube Data API not enabled | Enable API in Google Cloud Console |
| `invalid_grant` | Refresh token revoked | Re-run `setup_oauth.py` |
| `Access blocked` | Test user not added in OAuth consent screen | Add Google account as test user |
| Slack `404` | Invalid webhook URL | Recreate webhook in Slack App settings |
| 0 videos found | No likes in lookback period | Increase `--days` value |
