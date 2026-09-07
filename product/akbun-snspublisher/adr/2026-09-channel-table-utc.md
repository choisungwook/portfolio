# Channel rules as data, times in UTC

## Decision

Channel limits (max length, image required, max images) live in one table in `src/channels.js`. Scheduled times are stored as UTC ISO strings and converted only when displayed; the calendar takes an explicit time zone.

## Reason

- Four channels with different rules. A table is read in one glance and doubles as test input; branches per channel would spread across compose, validation, and publish.
- A post scheduled at 09:00 local must not drift an hour on daylight saving or a device time zone change. Storing UTC and converting at the edge is the only rule that survives both.
- Both rules are cheap now and expensive to retrofit once drafts are in D1.
