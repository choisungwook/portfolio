// Plain browser JavaScript, no bundler. Types come from JSDoc only.

const status = document.getElementById('status');

/** @param {string} text */
function setStatus(text) {
  if (status) status.textContent = text;
}

try {
  const response = await fetch('/api/health');
  /** @type {{ ok: boolean, version: string }} */
  const body = await response.json();
  setStatus(body.ok ? `API ok, version ${body.version}` : 'API returned an error');
} catch {
  setStatus('API unreachable');
}
