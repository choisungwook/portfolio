#!/usr/bin/env node
// Drive the running editor from a terminal. The same local socket and the same
// methods as the MCP server, without an AI client in between. Node standard
// library only, so it runs straight from a checkout.
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { request } from '../mcp/bridge.mjs';
import { launch, status } from '../mcp/app.mjs';

const require = createRequire(import.meta.url);

const USAGE = `akbun-makevideo <command> [options]

Editor
  status                         Running, version, revision, render and proxy state
  launch                         Open the app (macOS) and wait until it answers
  guide                          Edit command formats and timing rules

Project
  project [--summary]            Current document and stateToken
  projects                       Projects in the workspace
  open <file.akbunvideo>         Open a project (the current one is checkpointed)
  new [--width 1920 --height 1080 --fps 30]
  save <file.akbunvideo>         Save the open project
  import <media...>              Reference media files in the project

Edit
  preview <edits.json|->         Validate edits without applying them
  apply <edits.json|-> [--label] Apply edits as one undo step
  undo | redo
  checkpoints                    Recovery points, newest first
  checkpoint <label>             Make a recovery point
  restore <checkpointId>         Restore a whole project

Media and render
  sample <assetId> --start <ms> --end <ms> [--out dir]   Save JPEG frames
  library                        Saved templates and B-roll notes
  export <out.mp4> [--preset hd|fhd|4k] [--quality high|medium|low] [--wait]
  render-status | cancel-render

Options
  --token <stateToken>  Edit against this state. Without it the latest state is read first
  --compact             One-line JSON
  -h, --help`;

const OPTIONS = {
  token: { type: 'string' },
  label: { type: 'string' },
  summary: { type: 'boolean' },
  width: { type: 'string' },
  height: { type: 'string' },
  fps: { type: 'string' },
  start: { type: 'string' },
  end: { type: 'string' },
  out: { type: 'string' },
  preset: { type: 'string', default: 'fhd' },
  quality: { type: 'string', default: 'medium' },
  wait: { type: 'boolean' },
  compact: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

class UsageError extends Error {}

/** Paths go to the editor as absolute paths, resolved here against the shell. */
const absolute = (value) => path.resolve(value);

function need(value, what) {
  if (value === undefined || value === '') throw new UsageError(`Missing ${what}.`);
  return value;
}

function integer(value, what) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new UsageError(`${what} must be a whole number.`);
  return number;
}

async function readEdits(source) {
  const text = source === '-' ? await readStdin() : await readFile(absolute(need(source, 'an edits file or -')), 'utf8');
  const edits = JSON.parse(text);
  if (!Array.isArray(edits) || !edits.length) throw new UsageError('Edits must be a non-empty JSON array of command objects.');
  return edits;
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

/** Every editing method checks a stateToken. A terminal user usually wants the
 *  latest one, so it is read just before the call unless one was given. */
async function token(call, given) {
  if (given) return given;
  const now = await status(call);
  if (now.running === false) throw new Error(now.reason);
  // An editor older than get_status still answers get_project.
  return now.stateToken || (await call('get_project')).stateToken;
}

/** Frame rates as the exact ratios the editor keeps: 29.97 is 30000/1001. */
const NTSC = { '23.976': [24000, 1001], '29.97': [30000, 1001], '59.94': [60000, 1001] };
function rate(text) {
  const [num, den] = NTSC[text] || (text.includes('/') ? text.split('/').map(Number) : [Number(text), 1]);
  if (![num, den].every((part) => Number.isInteger(part) && part > 0)) {
    throw new UsageError(`--fps takes 24, 30, 29.97 or a ratio such as 30000/1001, not ${text}.`);
  }
  return { num, den };
}

/** Poll until the render reports a result. A render that stopped running
 *  and still has no result after a few polls ended without saying so. */
async function waitForRender(call, intervalMs = 1000) {
  let idle = 0;
  for (;;) {
    const now = await call('render_status');
    if (!now.running && now.result) return now;
    idle = now.running ? 0 : idle + 1;
    if (idle > 5) throw new Error('The render stopped without a result. Check the editor.');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function saveFrames(result, out) {
  const dir = absolute(out || '.');
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const frame of result.frames || []) {
    // The id names the file, so it is kept to characters that stay inside dir.
    const name = String(result.assetId || 'asset').replace(/[^A-Za-z0-9_-]/g, '_');
    const file = path.join(dir, `${name}-${Number(frame.timeMs) || 0}ms.jpg`);
    await writeFile(file, Buffer.from(frame.url.split(',')[1], 'base64'));
    files.push({ timeMs: frame.timeMs, file });
  }
  const { frames, ...rest } = result;
  return { ...rest, files };
}

export async function run(argv, call = request) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    throw new UsageError(error.message);
  }
  const { values: o, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (o.help || !command) return { usage: USAGE };
  const edit = async (method, args) => call(method, { stateToken: await token(call, o.token), ...args });

  switch (command) {
    case 'status': return status(call);
    case 'launch': return launch({ call });
    case 'guide': return { usage: require('../src/ai-workflow.js').guide };
    case 'project': {
      const state = await call('get_project');
      if (!o.summary) return state;
      const project = state.document.project;
      return { stateToken: state.stateToken, revision: state.document.revision, settings: project.settings, assets: project.assets.map(({ id, name, kind, durationMs }) => ({ id, name, kind, durationMs })), tracks: project.tracks.map(({ id, kind, name, clips }) => ({ id, kind, name, clips: clips.length })) };
    }
    case 'projects': return call('list_projects');
    case 'open': return edit('open_project', { path: absolute(need(rest[0], 'a project file')) });
    case 'new': {
      return edit('new_project', { settings: { width: integer(o.width || '1920', 'width'), height: integer(o.height || '1080', 'height'), rate: rate(o.fps || '30') } });
    }
    case 'save': return edit('save_project', { path: absolute(need(rest[0], 'a project file')) });
    case 'import': return edit('import_media', { paths: need(rest.length ? rest : undefined, 'media files').map(absolute) });
    case 'preview': return edit('preview_edits', { commands: await readEdits(rest[0]) });
    case 'apply': return edit('apply_edits', { label: o.label || 'CLI edit', commands: await readEdits(rest[0]) });
    case 'undo': return edit('undo', {});
    case 'redo': return edit('redo', {});
    case 'checkpoints': return call('list_checkpoints');
    case 'checkpoint': return call('create_checkpoint', { label: need(rest.join(' '), 'a label') });
    case 'restore': return edit('restore_checkpoint', { checkpointId: need(rest[0], 'a checkpoint id') });
    case 'sample': {
      const result = await call('sample_asset', { assetId: need(rest[0], 'an asset id'), startMs: integer(need(o.start, '--start'), '--start'), endMs: integer(need(o.end, '--end'), '--end') });
      return saveFrames(result, o.out);
    }
    case 'library': return call('get_library');
    case 'export': {
      const started = await edit('export_video', { path: absolute(need(rest[0], 'an output file')), preset: o.preset, quality: o.quality });
      return o.wait ? waitForRender(call) : started;
    }
    case 'render-status': return call('render_status');
    case 'cancel-render': return call('cancel_render');
    default: throw new UsageError(`Unknown command: ${command}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  try {
    const result = await run(argv);
    if (result && typeof result.usage === 'string') {
      process.stdout.write(`${result.usage}\n`);
      return;
    }
    const compact = argv.includes('--compact') || !process.stdout.isTTY;
    process.stdout.write(`${JSON.stringify(result, null, compact ? 0 : 2)}\n`);
    // An export that finished with a failure is a failed command.
    if (result && result.result && result.result.ok === false) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n${error instanceof UsageError ? '\nRun akbun-makevideo --help for usage.\n' : ''}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

// Run when executed, including through an npm link symlink; not when imported by the test.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
