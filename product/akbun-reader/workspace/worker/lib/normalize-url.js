// Pure URL normalization shared by the Worker and the tests. No runtime imports,
// so `node --test` runs it without a bundler.

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid']);

/**
 * Normalize a saved URL so the same page maps to one document.
 *
 * Rules: http(s) only, lowercase scheme and host, drop the fragment, drop
 * tracking query params, sort the remaining params, drop a default port and a
 * trailing slash on non-root paths.
 *
 * @param {string} input
 * @returns {string}
 * @throws {Error} when the input is not an absolute http(s) URL
 */
export function normalizeUrl(input) {
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('not an absolute URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('only http and https are supported');
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }

  const kept = [...url.searchParams.entries()].filter(([key]) => !isTrackingParam(key));
  kept.sort(([aKey, aValue], [bKey, bValue]) => compare(aKey, bKey) || compare(aValue, bValue));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @param {string} key */
function isTrackingParam(key) {
  return key.startsWith('utm_') || TRACKING_PARAMS.has(key);
}
