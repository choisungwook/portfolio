// Pure helpers over an OpenAPI document. Nothing here touches the DOM, so
// `node --test` runs them without a browser.
import { load as loadYaml } from 'js-yaml';

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

// Operations shown per page in the all-APIs view. Each card carries schema
// blocks, so hundreds at once make the first paint noticeably slow.
export const PAGE_SIZE = 10;

// Nesting depth at which a schema tree is cut off with an ellipsis.
const MAX_DEPTH = 6;

// A pasted document is untrusted input. Unlimited YAML aliases allow a
// billion-laughs expansion that freezes the tab; real specs use far fewer.
const MAX_ALIASES = 1000;

/**
 * Parses pasted or imported text into an OpenAPI document.
 * JSON first when it looks like JSON, because JSON.parse gives the better
 * error message; everything else goes through the YAML parser, which accepts
 * JSON anyway.
 */
export function parseSpec(text) {
  const source = String(text ?? '').trim();
  if (!source) throw new Error('The input is empty.');

  const doc = source.startsWith('{')
    ? JSON.parse(source)
    : loadYaml(source, { maxAliases: MAX_ALIASES });

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('Not an object. An OpenAPI document is a JSON or YAML object.');
  }
  if (!doc.openapi && !doc.swagger) {
    throw new Error('Missing the "openapi" version field. Is this an OpenAPI document?');
  }
  if (!doc.paths || typeof doc.paths !== 'object') {
    throw new Error('Missing "paths". There are no operations to show.');
  }
  return doc;
}

/** Title shown in the header, e.g. `Petstore 1.0.0`. */
export function specTitle(spec) {
  const info = spec?.info ?? {};
  const title = typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'OpenAPI';
  return info.version ? `${title} ${info.version}` : title;
}

/**
 * Flattens `paths` into one operation per method. Path-level parameters apply
 * to every operation under the path, so they are merged in here once and the
 * rest of the code never has to know they existed.
 */
export function listOperations(spec) {
  const ops = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (!item || typeof item !== 'object') continue;
    const pathParams = Array.isArray(item.parameters) ? item.parameters : [];

    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!operation || typeof operation !== 'object') continue;
      ops.push({
        id: `${method} ${path}`,
        method: method.toUpperCase(),
        path,
        summary: typeof operation.summary === 'string' ? operation.summary : '',
        operationId: typeof operation.operationId === 'string' ? operation.operationId : '',
        tags: Array.isArray(operation.tags) ? operation.tags : [],
        deprecated: operation.deprecated === true,
        parameters: [...pathParams, ...(Array.isArray(operation.parameters) ? operation.parameters : [])],
        operation,
      });
    }
  }
  return ops;
}

/**
 * Live search over method, path, summary, operationId and tags.
 * Every whitespace-separated word must match somewhere, so `get pets`
 * narrows rather than widens.
 */
export function filterOperations(ops, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return ops;

  return ops.filter((op) => {
    const haystack = [op.method, op.path, op.summary, op.operationId, ...op.tags].join(' ').toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function pageCount(total, size = PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / size));
}

/** One page of items, with the requested page clamped into range. */
export function pageSlice(items, page, size = PAGE_SIZE) {
  const last = pageCount(items.length, size);
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), last);
  return { items: items.slice((current - 1) * size, current * size), page: current, last };
}

/** Resolves a local `#/...` JSON pointer, or null when it leads nowhere. */
export function resolveRef(spec, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  let node = spec;
  for (const key of ref.slice(2).split('/')) {
    node = node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')];
    if (node == null) return null;
  }
  return node;
}

export function refName(ref) {
  return String(ref).split('/').pop();
}

/**
 * A schema as an indented text tree, `$ref`s resolved in place.
 * Required properties are marked with `*`. A ref already on the path renders
 * as `(circular)` instead of recursing forever.
 */
export function schemaText(spec, schema) {
  return schemaLines(spec, schema, [], 0).join('\n');
}

function schemaLines(spec, schema, seen, depth) {
  if (schema == null || typeof schema !== 'object') return ['any'];
  if (depth > MAX_DEPTH) return ['…'];

  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (seen.includes(schema.$ref)) return [`${name} (circular)`];
    const target = resolveRef(spec, schema.$ref);
    if (!target) return [`${name} (unresolved $ref)`];
    const lines = schemaLines(spec, target, [...seen, schema.$ref], depth);
    lines[0] = `${name} — ${lines[0]}`;
    return lines;
  }

  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[key])) {
      const lines = [`${key}:`];
      for (const option of schema[key]) {
        const sub = schemaLines(spec, option, seen, depth + 1);
        lines.push(`  - ${sub[0]}`, ...sub.slice(1).map((line) => `    ${line}`));
      }
      return lines;
    }
  }

  if (schema.type === 'array' || schema.items) {
    const sub = schemaLines(spec, schema.items ?? {}, seen, depth + 1);
    return [`array of ${sub[0]}`, ...sub.slice(1)];
  }

  if (schema.type === 'object' || schema.properties) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    const props = Object.entries(schema.properties ?? {});
    const lines = ['object'];
    for (const [name, prop] of props) {
      const mark = required.includes(name) ? '*' : '';
      const sub = schemaLines(spec, prop, seen, depth + 1);
      lines.push(`  ${name}${mark}: ${sub[0]}`, ...sub.slice(1).map((line) => `  ${line}`));
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const sub = schemaLines(spec, schema.additionalProperties, seen, depth + 1);
      lines.push(`  <key>: ${sub[0]}`, ...sub.slice(1).map((line) => `  ${line}`));
    }
    return lines;
  }

  return [typeLabel(schema)];
}

function typeLabel(schema) {
  let label = typeof schema.type === 'string' ? schema.type : 'any';
  if (schema.format) label += `(${schema.format})`;
  if (Array.isArray(schema.enum)) label += ` enum[${schema.enum.join(', ')}]`;
  if (schema.nullable === true) label += ' | null';
  return label;
}
