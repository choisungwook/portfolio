---
name: youtube-likes-slack
description: YouTube liked videos weekly digest automation to Slack/Email. Helps set up, configure, troubleshoot, and extend the YouTube likes automation pipeline.
triggers:
  - youtube likes
  - youtube automation
  - liked videos
  - youtube slack
  - youtube digest
  - youtube email
---

# YouTube Likes → Slack/Email Automation Skill

## Overview

이 스킬은 YouTube 좋아요 영상 주간 다이제스트 자동화를 관리한다.
여러 Google 계정의 좋아요 영상을 수집하고 Slack, Email로 알림을 보낸다.

## Project Location

- Scripts: `youtube-likes-automation/scripts/`
- Config template: `youtube-likes-automation/config.env.example`
- GitHub Actions: `.github/workflows/youtube-likes-digest.yml`

## Architecture

```
[Google Account 1] ──┐
[Google Account 2] ──┤── YouTube Data API v3 ──> fetch_likes.py ──> Slack Webhook
[Google Account N] ──┘                                          └──> Email (SMTP)
                                                                └──> JSON file
```

### Scheduling Options

| Method | Setup |
|--------|-------|
| GitHub Actions | `.github/workflows/youtube-likes-digest.yml` - 매주 월요일 09:00 KST |
| ChatGPT Custom GPT | OpenAPI spec으로 Action 등록 후 수동 실행 |
| Zapier/Make.com | Webhook trigger → Python script 실행 |
| Local cron | `crontab -e` → `0 9 * * 1 /path/to/fetch_likes.py` |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth 2.0 Client Secret |
| `GOOGLE_ACCOUNTS_JSON` | Yes | JSON array: `[{"label":"personal","refresh_token":"xxx"}]` |
| `SLACK_WEBHOOK_URL` | Yes* | Slack Incoming Webhook URL |
| `EMAIL_ENABLED` | No | `true` to enable email |
| `EMAIL_SMTP_HOST` | No | SMTP server (default: smtp.gmail.com) |
| `EMAIL_SMTP_PORT` | No | SMTP port (default: 587) |
| `EMAIL_FROM` | No | Sender email address |
| `EMAIL_TO` | No | Recipient email (comma-separated for multiple) |
| `EMAIL_PASSWORD` | No | SMTP password (Gmail: App Password) |
| `DAYS_LOOKBACK` | No | Days to look back (default: 7) |
| `MAX_RESULTS_PER_ACCOUNT` | No | Max videos per account (default: 50) |

## Setup Instructions

### Step 1: Google Cloud OAuth Setup

```bash
# 1. Google Cloud Console > APIs & Services > Credentials
# 2. Create OAuth 2.0 Client ID (type: Desktop App)
# 3. Enable YouTube Data API v3
# 4. Set environment variables:
export GOOGLE_CLIENT_ID='your-client-id'
export GOOGLE_CLIENT_SECRET='your-client-secret'
```

### Step 2: Get Refresh Tokens (per Google account)

```bash
cd youtube-likes-automation
pip install -r requirements.txt
python scripts/setup_oauth.py
# Browser opens → log in → authorize → repeat for each account
```

### Step 3: Slack Webhook Setup

```bash
# 1. https://api.slack.com/apps > Create New App > From scratch
# 2. Features > Incoming Webhooks > Activate
# 3. Add New Webhook to Workspace > Select channel
# 4. Copy Webhook URL
export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/T.../B.../xxx'
```

### Step 4: GitHub Actions Secrets

GitHub repo > Settings > Secrets and variables > Actions > New repository secret:
- `YT_GOOGLE_CLIENT_ID`
- `YT_GOOGLE_CLIENT_SECRET`
- `YT_GOOGLE_ACCOUNTS_JSON`
- `YT_SLACK_WEBHOOK_URL`

### Step 5: Test

```bash
python scripts/fetch_likes.py --dry-run
python scripts/fetch_likes.py --days 3
```

## When Assisting Users

1. **Setup questions**: Guide through OAuth credentials, API enablement, Slack webhook creation
2. **Multiple accounts**: Help configure `GOOGLE_ACCOUNTS_JSON` with proper format
3. **Troubleshooting**: Check API quotas, token expiry, webhook URL validity
4. **Extending**: Add new notification channels (Telegram, Discord, etc.)
5. **ChatGPT integration**: Help create OpenAPI spec for Custom GPT Actions

## Common Issues

- **403 on YouTube API**: API not enabled or OAuth scope insufficient
- **Token expired**: Refresh tokens don't expire unless revoked, but check Google Cloud consent screen status
- **Slack 404**: Webhook URL is invalid or the app was deleted
- **No liked videos found**: Check `DAYS_LOOKBACK` value, or the account may not have recent likes
