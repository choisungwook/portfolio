# PWA and an iOS Shortcut instead of a native app

## Decision

Ship the page as a PWA added to the iPhone home screen. Saving from the share sheet is a Shortcut that POSTs the URL to the API with a Bearer token. No native iOS app and no share extension.

## Reason

- A signed native app needs a paid developer account at about USD 8 a month, several times the whole hosting budget. A free account re-signs every seven days, which is a chore that would eventually stop the saves.
- A Shortcut reaches the share sheet without any signing and can be edited on the phone.
- The trade-off is accepted: a Shortcut has no background retry, so a failed save shows a notification and is shared again by hand.
