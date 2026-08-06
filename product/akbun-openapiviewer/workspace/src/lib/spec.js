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
 * The document re-serialized as JSON, two-space indented.
 * Exporting this is how a YAML spec comes back out as JSON.
 */
export function specJson(spec) {
  return `${JSON.stringify(spec, null, 2)}\n`;
}

/**
 * File name for the export, built from `info`, e.g. `petstore-1.0.0.json`.
 * A title is free text and can hold slashes, quotes or nothing usable, so it
 * is reduced to lowercase words joined by hyphens before it reaches a disk.
 * Dots survive, because a version reads worse as 1-0-0 than as 1.0.0.
 */
export function specFileName(spec) {
  const info = spec?.info ?? {};
  const parts = [info.title, info.version]
    .map((part) => String(part ?? '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^[-.]+|[-.]+$/g, ''))
    .filter(Boolean);
  return `${parts.join('-') || 'openapi'}.json`;
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

// ===== Request snippets =====

export const SNIPPET_LANGS = [
  { id: 'curl', label: 'curl' },
  { id: 'httpx', label: 'python httpx' },
  { id: 'requests', label: 'python requests' },
];

// Stands in when the document declares no server. A snippet with a real-looking
// host is easier to spot and replace than one starting at a bare path.
const FALLBACK_SERVER = 'https://api.example.com';

// Python clients that take the method as a named function. Anything else (trace)
// goes through .request("TRACE", ...).
const PY_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/** First declared server, without its trailing slash. */
export function serverUrl(spec) {
  const url = spec?.servers?.[0]?.url;
  return (typeof url === 'string' && url.trim() ? url.trim() : FALLBACK_SERVER).replace(/\/+$/, '');
}

/**
 * A schema reduced to one example value, for a request body.
 * `example` wins where the document gives one; otherwise a scalar becomes a
 * placeholder of its type. Circular refs and deep nesting stop at null.
 */
export function schemaExample(spec, schema, seen = [], depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > MAX_DEPTH) return null;
  if (schema.example !== undefined) return schema.example;

  if (schema.$ref) {
    if (seen.includes(schema.$ref)) return null;
    return schemaExample(spec, resolveRef(spec, schema.$ref), [...seen, schema.$ref], depth + 1);
  }

  // allOf is a merge, so the parts are combined; oneOf/anyOf is a choice, so the
  // first branch is shown rather than an object that satisfies none of them.
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.reduce(
      (acc, part) => Object.assign(acc, schemaExample(spec, part, seen, depth + 1) ?? {}),
      {},
    );
  }
  for (const key of ['oneOf', 'anyOf']) {
    if (Array.isArray(schema[key])) return schemaExample(spec, schema[key][0], seen, depth + 1);
  }

  if (Array.isArray(schema.enum)) return schema.enum[0] ?? null;

  if (schema.type === 'array' || schema.items) {
    return [schemaExample(spec, schema.items ?? {}, seen, depth + 1)];
  }

  if (schema.type === 'object' || schema.properties) {
    const out = {};
    for (const [name, prop] of Object.entries(schema.properties ?? {})) {
      out[name] = schemaExample(spec, prop, seen, depth + 1);
    }
    return out;
  }

  return scalarExample(schema);
}

function scalarExample(schema) {
  if (schema.default !== undefined) return schema.default;
  switch (schema.type) {
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'string':
      return schema.format === 'date-time' ? '2026-01-01T00:00:00Z' : 'string';
    default:
      return null;
  }
}

/**
 * The pieces every snippet needs: URL with required query parameters filled in,
 * required headers, and the JSON body when the operation takes one.
 * Path placeholders are left as `{petId}` — substituting a made-up id hides the
 * fact that the caller has to supply one.
 */
function requestParts(spec, op) {
  const params = (op.parameters ?? [])
    .map((param) => (param?.$ref ? resolveRef(spec, param.$ref) : param))
    .filter((param) => param && typeof param === 'object' && param.required);

  const query = params
    .filter((param) => param.in === 'query')
    .map((param) => `${encodeURIComponent(param.name)}=${encodeURIComponent(paramValue(spec, param))}`);

  const headers = {};
  for (const param of params.filter((p) => p.in === 'header')) {
    headers[param.name] = String(paramValue(spec, param));
  }

  const raw = op.operation?.requestBody;
  const requestBody = raw?.$ref ? resolveRef(spec, raw.$ref) : raw;
  const jsonType = Object.keys(requestBody?.content ?? {}).find((type) => type.includes('json'));
  const body = jsonType
    ? schemaExample(spec, requestBody.content[jsonType].schema)
    : undefined;
  if (jsonType) headers['Content-Type'] = jsonType;

  const url = `${serverUrl(spec)}${op.path}${query.length ? `?${query.join('&')}` : ''}`;
  return { url, headers, body, hasBody: Boolean(jsonType) };
}

function paramValue(spec, param) {
  const value = param.example ?? schemaExample(spec, param.schema);
  return value == null || typeof value === 'object' ? param.name : value;
}

/**
 * One request snippet for an operation.
 * `pretty` breaks it across lines; otherwise it is a single line to paste.
 */
export function snippet(spec, op, lang, pretty = true) {
  const parts = requestParts(spec, op);
  if (lang === 'curl') return curlSnippet(op, parts, pretty);
  return pySnippet(lang === 'requests' ? 'requests' : 'httpx', op, parts, pretty);
}

// Single quotes are the only shell quoting that leaves JSON alone, and the one
// thing they cannot hold is a single quote, hence the close-escape-reopen dance.
function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function curlSnippet(op, { url, headers, body, hasBody }, pretty) {
  // Method and URL are one argument here so that wrapping never splits them off
  // onto a line of their own, which reads as if the request had no target.
  const args = [`-X ${op.method} ${shellQuote(url)}`];
  for (const [name, value] of Object.entries(headers)) args.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  if (hasBody) args.push(`-d ${shellQuote(JSON.stringify(body, null, pretty ? 2 : 0))}`);
  return pretty ? `curl ${args.join(' \\\n  ')}` : `curl ${args.join(' ')}`;
}

function pySnippet(module, op, { url, headers, body, hasBody }, pretty) {
  const method = op.method.toLowerCase();
  const call = PY_METHODS.includes(method)
    ? { name: `${module}.${method}`, lead: [] }
    : { name: `${module}.request`, lead: [JSON.stringify(op.method)] };

  const args = [...call.lead, JSON.stringify(url)];
  if (Object.keys(headers).length) args.push(`headers=${pyLiteral(headers, pretty, '    ')}`);
  if (hasBody) args.push(`json=${pyLiteral(body, pretty, '    ')}`);

  if (!pretty) {
    return `import ${module}; print(${call.name}(${args.join(', ')}).json())`;
  }
  return [
    `import ${module}`,
    '',
    `response = ${call.name}(`,
    ...args.map((arg) => `    ${arg},`),
    ')',
    'print(response.json())',
  ].join('\n');
}

/** A JS value as a Python literal, one line or indented. */
function pyLiteral(value, pretty, indent = '') {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);

  const pad = `${indent}    `;
  const wrap = (open, close, items) => (pretty
    ? `${open}\n${items.map((item) => `${pad}${item},`).join('\n')}\n${indent}${close}`
    : `${open}${items.join(', ')}${close}`);

  if (Array.isArray(value)) {
    return value.length ? wrap('[', ']', value.map((item) => pyLiteral(item, pretty, pad))) : '[]';
  }
  const entries = Object.entries(value);
  return entries.length
    ? wrap('{', '}', entries.map(([key, val]) => `${JSON.stringify(key)}: ${pyLiteral(val, pretty, pad)}`))
    : '{}';
}
