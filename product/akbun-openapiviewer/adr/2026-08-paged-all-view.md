# The all-APIs view renders 10 cards per page

## Decision

The all-APIs view shows the same full detail card used for a single operation, but only 10 per page, with Prev/Next controls. The page is cut from the search-filtered list and typing resets to page 1. The sidebar list is never paged.

## Reason

A real spec can hold hundreds of operations and each card carries several schema blocks; rendering all of them at once visibly freezes the first paint. Paging removes the freeze with one slice function and two buttons, where virtualized scrolling would add measurement, scroll bookkeeping and a library. The sidebar stays unpaged because one-line buttons are cheap at any size a browser can hold the spec at.
