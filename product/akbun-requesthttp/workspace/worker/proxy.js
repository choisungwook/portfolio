// Pure mapping between the page's request spec and the fetch API. The
// worker's fetch handler stays a thin wrapper so node can test this file
// without a Workers runtime.

export function validateSpec(spec) {
  let url;
  try {
    url = new URL(spec.url);
  } catch {
    return 'invalid URL';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'only http and https URLs are allowed';
  }
  return null;
}

export function specToInit(spec, settings) {
  const headers = new Headers();
  for (const header of spec.headers || []) {
    if (header.key) headers.append(header.key, header.value ?? '');
  }
  const method = (spec.method || 'GET').toUpperCase();
  const init = {
    method,
    headers,
    redirect: settings && settings.followRedirects === false ? 'manual' : 'follow',
  };
  if (spec.body && method !== 'GET' && method !== 'HEAD') init.body = spec.body;
  return init;
}

export function requestTimeoutMs(settings) {
  const seconds = Number(settings && settings.timeoutSecs);
  return 1000 * (Number.isFinite(seconds) && seconds >= 1 ? seconds : 60);
}

// The same response shape the desktop Rust engine returns.
export function resultFrom(response, bodyText, elapsedMs, sizeBytes) {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers].map(([key, value]) => ({ key, value })),
    body: bodyText,
    elapsedMs,
    sizeBytes,
  };
}
