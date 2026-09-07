# Plain page, no bundler

## Decision

The page under `workspace/src/` is plain HTML, CSS, and JavaScript served as-is by the assets binding. Types in the page are JSDoc only. The Worker is TypeScript because wrangler bundles it anyway.

## Reason

- The product has four screens: list, reader, tags, settings. Framework state management would be more code than the screens.
- The repository's desktop rule already prefers no build step so that the source in git is the source that runs; the same reasoning holds here.
- A bundler was in the first draft only because a sibling product uses one. Removing it deletes a dependency and a build job without losing anything the page needs.
