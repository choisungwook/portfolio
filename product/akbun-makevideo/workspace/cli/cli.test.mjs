import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { run } from './akbun-makevideo.mjs';

/** A fake editor that records each call and answers from a table. */
function fakeEditor(answers) {
  const calls = [];
  const call = async (method, args = {}) => {
    calls.push({ method, args });
    const answer = answers[method];
    if (answer instanceof Error) throw answer;
    return typeof answer === 'function' ? answer(args) : answer;
  };
  return { calls, call };
}

test('editing commands read the latest stateToken unless one is given', async () => {
  const editor = fakeEditor({ get_status: { running: true, stateToken: 'latest' }, undo: { ok: true } });
  await run(['undo'], editor.call);
  assert.deepEqual(editor.calls.map((c) => c.method), ['get_status', 'undo']);
  assert.equal(editor.calls[1].args.stateToken, 'latest');
  await run(['undo', '--token', 'given'], editor.call);
  assert.equal(editor.calls.at(-1).args.stateToken, 'given');
});

test('paths are resolved against the shell and export forwards preset and quality', async () => {
  const editor = fakeEditor({ get_status: { stateToken: 't' }, import_media: {}, export_video: { started: true } });
  await run(['import', 'clip.mov'], editor.call);
  assert.equal(editor.calls[1].args.paths[0], path.resolve('clip.mov'));
  await run(['export', 'out.mp4', '--preset', '4k', '--quality', 'high'], editor.call);
  assert.deepEqual(editor.calls.at(-1).args, { stateToken: 't', path: path.resolve('out.mp4'), preset: '4k', quality: 'high' });
});

test('apply reads an edits file, and sample writes JPEG frames', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mv-cli-'));
  try {
    const edits = path.join(dir, 'edits.json');
    await writeFile(edits, JSON.stringify([{ op: 'splitAt', frame: 30 }]));
    const editor = fakeEditor({
      get_status: { stateToken: 't' },
      apply_edits: (args) => ({ checkpointId: '1', got: args.commands.length }),
      sample_asset: { assetId: 'a', frames: [{ timeMs: 0, url: 'data:image/jpeg;base64,/9j/' }] },
    });
    assert.equal((await run(['apply', edits, '--label', 'cut'], editor.call)).got, 1);
    assert.equal(editor.calls[1].args.label, 'cut');
    const sampled = await run(['sample', 'a', '--start', '0', '--end', '1000', '--out', dir], editor.call);
    assert.deepEqual([...(await readFile(sampled.files[0].file))], [0xff, 0xd8, 0xff]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('bad input is a usage error and a closed app is reported, not thrown', async () => {
  const editor = fakeEditor({ get_status: Object.assign(new Error('Cannot reach akbun-makevideo.'), { code: 'UNREACHABLE' }) });
  await assert.rejects(run(['nope'], editor.call), /Unknown command/);
  await assert.rejects(run(['sample', 'a', '--start', 'x', '--end', '1'], editor.call), /whole number/);
  await assert.rejects(run(['export', 'o.mp4', '--presets', '4k'], editor.call), (error) => error.constructor.name === 'UsageError');
  assert.equal((await run(['status'], editor.call)).running, false);
  await assert.rejects(run(['undo'], editor.call), /Cannot reach/);
});

test('new maps broadcast rates to exact ratios and an older editor still yields a token', async () => {
  const editor = fakeEditor({ get_status: new Error('Unknown method'), get_project: { stateToken: 'old' }, new_project: (args) => args });
  const made = await run(['new', '--fps', '29.97'], editor.call);
  assert.deepEqual(made.settings.rate, { num: 30000, den: 1001 });
  assert.equal(made.stateToken, 'old');
  await assert.rejects(run(['new', '--fps', 'abc'], editor.call), /--fps/);
});

test('the executable talks to the socket and reports a closed app as running=false', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mv-cli-'));
  const endpoint = path.join(dir, 's');
  const server = net.createServer((socket) => socket.once('data', () => socket.end(JSON.stringify({ result: { running: true, stateToken: 'x' } }) + '\n')));
  await new Promise((resolve) => server.listen(endpoint, resolve));
  const exec = (env) => new Promise((resolve) => execFile(process.execPath, [new URL('./akbun-makevideo.mjs', import.meta.url).pathname, 'status'], { env: { ...process.env, ...env } }, (error, stdout) => resolve({ code: error ? error.code : 0, stdout })));
  try {
    const up = await exec({ AKBUN_MAKEVIDEO_SOCKET: endpoint });
    assert.equal(JSON.parse(up.stdout).stateToken, 'x');
    const down = await exec({ AKBUN_MAKEVIDEO_SOCKET: path.join(dir, 'missing') });
    assert.equal(JSON.parse(down.stdout).running, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
