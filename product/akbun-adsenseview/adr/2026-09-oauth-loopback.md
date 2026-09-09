# OAuth installed-app flow with a loopback port

## Decision

Sign in with the OAuth 2.0 installed-app flow. `client_secret.json` is read from the config directory, never bundled. The app binds `127.0.0.1` on a free port, opens the consent URL in the default browser with `access_type=offline` and `prompt=consent`, waits up to five minutes for the redirect, exchanges the code and saves `token.json` with the refresh token. The access token is refreshed when it is within a minute of expiry. No PKCE.

## Reason

The scope is read-only and the account is the owner's own, so the plain desktop flow is enough. `prompt=consent` is there because Google only returns a refresh token on the first consent; without it a second sign-in after deleting `token.json` would come back without one and the app would need a sign-in on every start.

The secret stays out of the source tree because the repository is public. Reading it from the config folder means the file the user downloaded from Google Cloud is the only copy.

The loopback listener polls with `set_nonblocking` and a deadline instead of a blocking `accept`, so closing the browser tab does not leave the command hanging forever. Only the first request is read; the favicon request a browser sends afterwards hits a closed port.

PKCE was left out. Google accepts it for desktop clients but does not require it when the client secret is sent, and it would add two crates for a hash and a base64 encoding.
