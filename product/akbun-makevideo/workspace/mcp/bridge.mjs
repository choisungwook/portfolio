import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const socketPath = process.env.AKBUN_MAKEVIDEO_SOCKET || path.join(os.homedir(), '.akbun-makevideo/control.sock');

export function request(method, args = {}, endpoint = socketPath) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let data = '';
    const finish = (error, result) => {
      socket.destroy();
      error ? reject(error) : resolve(result);
    };
    socket.setEncoding('utf8');
    socket.setTimeout(120_000, () => finish(new Error('Editor request timed out. Read get_project/render_status before retrying; the operation may have completed.')));
    socket.on('connect', () => socket.write(JSON.stringify({ method, args }) + '\n'));
    socket.on('error', (error) => finish(new Error(`Cannot reach akbun-makevideo. Open the MCP-enabled app first. ${error.message}`)));
    socket.on('data', (chunk) => {
      data += chunk;
      if (data.length > 32 * 1024 * 1024) return finish(new Error('Editor response too large'));
      if (!data.includes('\n')) return;
      try {
        const response = JSON.parse(data.slice(0, data.indexOf('\n')));
        finish(response.error ? new Error(response.error) : null, response.result);
      } catch (error) { finish(error); }
    });
    socket.on('end', () => { if (!data.includes('\n')) finish(new Error('Editor disconnected before returning a result. Read state before retrying.')); });
  });
}
