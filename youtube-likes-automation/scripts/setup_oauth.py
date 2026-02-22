#!/usr/bin/env python3
"""Google OAuth2 Setup Helper

Runs the OAuth2 authorization flow for each Google account
and prints the refresh token to store in environment variables.

Prerequisites:
  1. Google Cloud Console > APIs & Services > Credentials
     - Create an OAuth 2.0 Client ID (type: Desktop App)
     - Enable YouTube Data API v3
  2. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars

Usage:
    python setup_oauth.py
"""

import json
import os
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")


def run_oauth_flow(label: str) -> str | None:
    """Run OAuth2 flow and return the refresh token."""
    client_config = {
        "installed": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)

    print(f"\n--- Authorizing account: {label} ---")
    print("A browser window will open. Log in with the Google account you want to use.")
    print("If running on a remote server, use --console flag.\n")

    credentials = flow.run_local_server(port=0)

    if credentials and credentials.refresh_token:
        return credentials.refresh_token

    print("[WARN] No refresh token obtained. Ensure 'access_type=offline' is set.")
    return None


def main():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        print("ERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.")
        print()
        print("  export GOOGLE_CLIENT_ID='your-client-id'")
        print("  export GOOGLE_CLIENT_SECRET='your-client-secret'")
        sys.exit(1)

    print("=" * 60)
    print("  YouTube Likes Automation - OAuth2 Setup")
    print("=" * 60)
    print()
    print("This will open a browser for each Google account.")
    print("You'll authorize read-only YouTube access.")
    print()

    accounts = []

    while True:
        label = input("Enter a label for this account (e.g. 'personal', 'work'): ").strip()
        if not label:
            print("Label cannot be empty.")
            continue

        refresh_token = run_oauth_flow(label)
        if refresh_token:
            accounts.append({"label": label, "refresh_token": refresh_token})
            print(f"[OK] Got refresh token for '{label}'.")
        else:
            print(f"[FAIL] Could not get refresh token for '{label}'.")

        another = input("\nAdd another Google account? (y/N): ").strip().lower()
        if another != "y":
            break

    if not accounts:
        print("\nNo accounts configured. Exiting.")
        sys.exit(1)

    # Output
    accounts_json = json.dumps(accounts, indent=2)
    print()
    print("=" * 60)
    print("  Setup Complete!")
    print("=" * 60)
    print()
    print("Set the following environment variable:")
    print()
    print(f"GOOGLE_ACCOUNTS_JSON='{accounts_json}'")
    print()
    print("For GitHub Actions, add this as a repository secret.")
    print("IMPORTANT: Keep these tokens secure. Do NOT commit them.")
    print()

    # Optionally save to file
    save = input("Save to .env.local file? (y/N): ").strip().lower()
    if save == "y":
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
        with open(env_path, "w") as f:
            f.write(f"GOOGLE_CLIENT_ID={GOOGLE_CLIENT_ID}\n")
            f.write(f"GOOGLE_CLIENT_SECRET={GOOGLE_CLIENT_SECRET}\n")
            f.write(f"GOOGLE_ACCOUNTS_JSON='{accounts_json}'\n")
        print(f"[OK] Saved to {env_path}")
        print("[WARN] Make sure .env.local is in .gitignore!")


if __name__ == "__main__":
    main()
