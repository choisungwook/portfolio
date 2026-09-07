# Public share pages bypass Access on one path

## Decision

Serve public tag and feed lists under `/public/<32-hex id>` with no authentication. The id is a row in the `shares` table; one row per tag or feed, and deleting the row is the only way to revoke a link. Access must bypass this path. Creating and deleting shares is allowed only with the browser session, never with an API token.

## Reason

- Access is per hostname, and a second hostname would need its own Worker binding and Access application for a list page. One bypassed path keeps a single deploy.
- A 128-bit random id is not guessable, and the page carries `noindex`, so a link is as private as the person who has it.
- Only titles, links, dates, and summaries are exposed. Extracted bodies of third-party pages stay private, which keeps the public page from republishing other people's articles.
- A leaked API token already grants reads. Letting it also publish lists would turn a read leak into a public one, so share management stays behind the same rule as token management.
