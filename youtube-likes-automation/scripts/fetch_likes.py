#!/usr/bin/env python3
"""YouTube Liked Videos Weekly Digest

Fetches liked videos from one or more YouTube/Google accounts
and sends a digest to Slack, Email, or both.

Usage:
    python fetch_likes.py [--days 7] [--dry-run]
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import requests
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# ---------------------------------------------------------------------------
# Configuration (loaded from environment variables)
# ---------------------------------------------------------------------------
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

# Multiple accounts: JSON array of objects
# e.g. [{"label":"personal","refresh_token":"xxx"},{"label":"work","refresh_token":"yyy"}]
GOOGLE_ACCOUNTS_JSON = os.environ.get("GOOGLE_ACCOUNTS_JSON", "[]")

SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")

EMAIL_ENABLED = os.environ.get("EMAIL_ENABLED", "false").lower() == "true"
EMAIL_SMTP_HOST = os.environ.get("EMAIL_SMTP_HOST", "smtp.gmail.com")
EMAIL_SMTP_PORT = int(os.environ.get("EMAIL_SMTP_PORT", "587"))
EMAIL_FROM = os.environ.get("EMAIL_FROM", "")
EMAIL_TO = os.environ.get("EMAIL_TO", "")
EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD", "")

DAYS_LOOKBACK = int(os.environ.get("DAYS_LOOKBACK", "7"))
MAX_RESULTS_PER_ACCOUNT = int(os.environ.get("MAX_RESULTS_PER_ACCOUNT", "50"))

TOKEN_URI = "https://oauth2.googleapis.com/token"
YOUTUBE_API_SERVICE = "youtube"
YOUTUBE_API_VERSION = "v3"


# ---------------------------------------------------------------------------
# YouTube helpers
# ---------------------------------------------------------------------------
def build_youtube_client(refresh_token: str):
    """Build an authenticated YouTube API client using a refresh token."""
    credentials = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=TOKEN_URI,
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=["https://www.googleapis.com/auth/youtube.readonly"],
    )
    return build(YOUTUBE_API_SERVICE, YOUTUBE_API_VERSION, credentials=credentials)


def fetch_liked_videos(youtube, days: int, max_results: int) -> list[dict]:
    """Fetch liked videos from the 'LL' (Liked) playlist.

    The 'LL' playlist contains videos in reverse chronological order
    of when the user liked them.  ``snippet.publishedAt`` is the
    timestamp when the video was added to the playlist (= liked).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    liked_videos = []
    next_page_token = None

    while True:
        request = youtube.playlistItems().list(
            part="snippet,contentDetails",
            playlistId="LL",
            maxResults=min(max_results, 50),
            pageToken=next_page_token,
        )
        response = request.execute()

        for item in response.get("items", []):
            published_at_str = item["snippet"]["publishedAt"]
            published_at = datetime.fromisoformat(
                published_at_str.replace("Z", "+00:00")
            )

            # Stop when we reach videos liked before the cutoff
            if published_at < cutoff:
                return liked_videos

            video_id = item["contentDetails"]["videoId"]
            liked_videos.append(
                {
                    "title": item["snippet"]["title"],
                    "video_id": video_id,
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "channel": item["snippet"].get("videoOwnerChannelTitle", ""),
                    "liked_at": published_at.isoformat(),
                    "thumbnail": (
                        item["snippet"]
                        .get("thumbnails", {})
                        .get("medium", {})
                        .get("url", "")
                    ),
                }
            )

            if len(liked_videos) >= max_results:
                return liked_videos

        next_page_token = response.get("nextPageToken")
        if not next_page_token:
            break

    return liked_videos


# ---------------------------------------------------------------------------
# Notification helpers
# ---------------------------------------------------------------------------
def format_slack_message(all_accounts_likes: dict[str, list[dict]], days: int) -> dict:
    """Build a Slack Block Kit message from liked videos."""
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"YouTube Liked Videos - Last {days} Days",
            },
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
                }
            ],
        },
        {"type": "divider"},
    ]

    total = 0
    for account_label, videos in all_accounts_likes.items():
        total += len(videos)
        if not videos:
            continue

        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{account_label}* ({len(videos)} videos)",
                },
            }
        )

        for v in videos:
            liked_date = datetime.fromisoformat(v["liked_at"]).strftime("%m/%d")
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": (
                            f"*<{v['url']}|{v['title']}>*\n"
                            f"{v['channel']}  |  Liked: {liked_date}"
                        ),
                    },
                }
            )

        blocks.append({"type": "divider"})

    # Summary footer
    blocks.append(
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"Total: *{total}* videos liked across *{len(all_accounts_likes)}* accounts",
                }
            ],
        }
    )

    return {"blocks": blocks}


def send_slack(message: dict) -> bool:
    """Post a message to Slack via incoming webhook."""
    if not SLACK_WEBHOOK_URL:
        print("[WARN] SLACK_WEBHOOK_URL is not set. Skipping Slack notification.")
        return False

    resp = requests.post(
        SLACK_WEBHOOK_URL,
        json=message,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"[ERROR] Slack webhook returned {resp.status_code}: {resp.text}")
        return False

    print("[OK] Slack notification sent.")
    return True


def send_email(all_accounts_likes: dict[str, list[dict]], days: int) -> bool:
    """Send digest via email using SMTP."""
    if not EMAIL_ENABLED:
        return False

    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    subject = f"YouTube Liked Videos - Last {days} Days"

    # Build HTML body
    html_parts = [
        "<html><body>",
        f"<h2>{subject}</h2>",
        f"<p>Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</p>",
    ]

    total = 0
    for account_label, videos in all_accounts_likes.items():
        total += len(videos)
        if not videos:
            continue
        html_parts.append(f"<h3>{account_label} ({len(videos)} videos)</h3><ul>")
        for v in videos:
            liked_date = datetime.fromisoformat(v["liked_at"]).strftime("%m/%d")
            html_parts.append(
                f'<li><a href="{v["url"]}">{v["title"]}</a> '
                f"- {v['channel']} (Liked: {liked_date})</li>"
            )
        html_parts.append("</ul>")

    html_parts.append(f"<hr><p>Total: {total} videos</p></body></html>")
    html_body = "\n".join(html_parts)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = EMAIL_FROM
    msg["To"] = EMAIL_TO
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(EMAIL_SMTP_HOST, EMAIL_SMTP_PORT) as server:
            server.starttls()
            server.login(EMAIL_FROM, EMAIL_PASSWORD)
            server.sendmail(EMAIL_FROM, EMAIL_TO.split(","), msg.as_string())
        print("[OK] Email sent.")
        return True
    except Exception as e:
        print(f"[ERROR] Email failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="YouTube Likes Weekly Digest")
    parser.add_argument(
        "--days",
        type=int,
        default=DAYS_LOOKBACK,
        help="Number of days to look back (default: DAYS_LOOKBACK env or 7)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and print results without sending notifications",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        help="Save results to a JSON file",
    )
    args = parser.parse_args()

    # Parse accounts
    try:
        accounts = json.loads(GOOGLE_ACCOUNTS_JSON)
    except json.JSONDecodeError:
        print("[ERROR] GOOGLE_ACCOUNTS_JSON is not valid JSON.")
        sys.exit(1)

    if not accounts:
        print("[ERROR] No Google accounts configured. Set GOOGLE_ACCOUNTS_JSON.")
        sys.exit(1)

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        print("[ERROR] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.")
        sys.exit(1)

    # Fetch liked videos for each account
    all_likes: dict[str, list[dict]] = {}

    for account in accounts:
        label = account.get("label", "unknown")
        refresh_token = account.get("refresh_token", "")
        if not refresh_token:
            print(f"[WARN] Account '{label}' has no refresh_token. Skipping.")
            continue

        print(f"[INFO] Fetching liked videos for '{label}'...")
        try:
            youtube = build_youtube_client(refresh_token)
            videos = fetch_liked_videos(
                youtube, days=args.days, max_results=MAX_RESULTS_PER_ACCOUNT
            )
            all_likes[label] = videos
            print(f"[INFO] Found {len(videos)} liked videos for '{label}'.")
        except Exception as e:
            print(f"[ERROR] Failed to fetch for '{label}': {e}")
            all_likes[label] = []

    # Output
    if args.output_json:
        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(all_likes, f, ensure_ascii=False, indent=2)
        print(f"[OK] Results saved to {args.output_json}")

    if args.dry_run:
        print("\n--- DRY RUN: Results ---")
        for label, videos in all_likes.items():
            print(f"\n[{label}] ({len(videos)} videos)")
            for v in videos:
                print(f"  - {v['title']} ({v['channel']}) - {v['url']}")
        return

    # Send notifications
    slack_msg = format_slack_message(all_likes, args.days)
    send_slack(slack_msg)
    send_email(all_likes, args.days)


if __name__ == "__main__":
    main()
