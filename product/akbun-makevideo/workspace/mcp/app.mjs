// Whether the editor is running, and starting it when it is not. Shared by the
// MCP server and the CLI, and kept to the Node standard library so the CLI
// runs without installing anything.
import { execFile } from 'node:child_process';
import { request } from './bridge.mjs';

export const APP_NAME = 'akbun-makevideo';

/** The editor's status, or `{ running: false }` when nothing answers on the
 *  socket. Not reaching the app is an answer here, not an error. An editor
 *  that answers but refuses the method is running, just older than
 *  get_status, and must not be launched a second time. */
export async function status(call = request) {
  try {
    return await call('get_status');
  } catch (error) {
    if (error.code === 'UNREACHABLE') return { running: false, reason: error.message };
    return { running: true, reason: `This editor does not report status (${error.message}). Update the app for get_status.` };
  }
}

/** Open the installed app and wait until it answers. The command and its
 *  arguments are fixed: nothing from the caller reaches the shell. */
export async function launch({ call = request, open = openApp, timeoutMs = 30_000, intervalMs = 500 } = {}) {
  const before = await status(call);
  if (before.running) return { ...before, launched: false };
  if (process.platform !== 'darwin') throw new Error('Launching the editor is supported on macOS only. Start it yourself, then retry.');
  await open();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const now = await status(call);
    if (now.running) return { ...now, launched: true };
  }
  throw new Error(`${APP_NAME} did not answer within ${Math.round(timeoutMs / 1000)} seconds of starting. Check that it is installed in /Applications.`);
}

function openApp() {
  return new Promise((resolve, reject) => {
    execFile('open', ['-a', APP_NAME], (error) => (error ? reject(new Error(`Cannot open ${APP_NAME}: ${error.message}`)) : resolve()));
  });
}
