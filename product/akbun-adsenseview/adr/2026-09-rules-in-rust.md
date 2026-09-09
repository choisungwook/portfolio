# Rules in Rust, sums in the page

## Decision

The page calls only the app's own commands. OAuth, the AdSense client, the cache rule and SQLite are Rust. Totals, daily sums, top N, RPM and the domain rollup are computed in the page from the rows a command returns. The webview has `core:default` permission only.

## Reason

Every rule that can be wrong in an expensive way, which is what to refetch and what to overwrite, sits next to the tests for it in one crate that compiles without Tauri. The page cannot bypass the cache or hit the API on its own, and the capability list stays at one entry because opening the browser and the config folder happen from Rust.

The sums stay in the page because they are cheap, they change with every sidebar click, and asking Rust for a new aggregate on every click would mean a round trip for a loop over a few thousand rows.
