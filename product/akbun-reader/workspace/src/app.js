// Plain browser JavaScript, no bundler. Types come from JSDoc only.

const status = document.getElementById('status');

/** @param {string} text */
function setStatus(text) {
  if (status) status.textContent = text;
}

try {
  const response = await fetch('/api/health');
  if (!response.ok) {
    setStatus(`API returned HTTP ${response.status}`);
  } else {
    /** @type {{ ok: boolean }} */
    const body = await response.json();
    setStatus(body.ok ? 'API ok' : 'API reports not ok');
  }
} catch (error) {
  setStatus(`API unreachable: ${error instanceof Error ? error.message : String(error)}`);
}
