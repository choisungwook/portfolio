# Plain page with hash routing, no bundler

## Decision

The page is plain HTML, CSS, and JavaScript served as-is, with JSDoc types instead of TypeScript. Screens are switched by the URL hash. Astro from the first design is not used.

## Reason

- Three screens (compose, queue, calendar) plus a settings screen later. A framework's state management would be more code than the screens.
- Hash routing needs no server rewrite rule and keeps the assets binding a static file server.
- The repository already prefers no build step so that the source in git is the source that runs; akbun-reader made the same call.
- Every element is built with `createElement`, so post bodies are never parsed as HTML.
