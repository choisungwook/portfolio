# Settle days decide what is refetched

## Decision

Two SQLite tables: `daily(day, kind, name, ...)` and `fetched(day, kind)`. A day is fetched from the API when it is newer than `today - settleDays`, or when it is not in `fetched` for that kind. Fetched days are grouped into contiguous ranges, one API call per range. Each answer replaces the rows of its range and marks every day in the range fetched, even when the answer had no rows. `settleDays` defaults to 7 and is a setting.

## Reason

AdSense revises recent days for about a week: invalid traffic is removed and earnings are finalized. A cache that trusted yesterday's number would drift from what AdSense shows. Refetching the settle window on every load costs at most a few API calls, and the older days, which are the bulk of any long period, come from SQLite.

The `fetched` table exists because absence of rows is not absence of an answer. A page with no traffic on a day returns no row, and without a mark the app would ask for that day on every load forever. Marking days rather than ranges keeps the rule simple: a day either was asked or was not.

Replacing a range instead of upserting rows is what lets a name that vanished from the API answer vanish from the cache too. An upsert would leave stale rows for renamed channels or removed sites.

Site, page and channel are separate kinds because a report grouped by one dimension says nothing about the others.
