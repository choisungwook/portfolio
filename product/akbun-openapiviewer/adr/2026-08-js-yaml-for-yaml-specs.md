# js-yaml is the one runtime dependency

## Decision

Accept YAML input by depending on js-yaml. JSON input still goes through `JSON.parse` first, because its error messages carry the position; everything else goes to `yaml.load`, which accepts JSON anyway.

Note for the future: js-yaml 5 exports named functions only. `import { load } from 'js-yaml'` works; a default import fails at runtime.

## Reason

Most OpenAPI documents in the wild are authored in YAML, so a JSON-only viewer would reject the file most users import first. A YAML parser is not something a few lines can replace, which is the bar this repository sets for adding a dependency, and js-yaml is the boring, ubiquitous choice.
