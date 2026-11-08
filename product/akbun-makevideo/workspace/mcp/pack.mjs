// Build akbun-makevideo.mcpb: a bundle an MCP client installs in one step,
// with no node path or config file to edit. The server reads the editing guide
// from ../src and the app version from ../package.json, so the bundle keeps
// that layout: manifest at the root, the server under mcp/.
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.dirname(here);
const output = path.resolve(process.argv[2] || path.join(workspace, 'akbun-makevideo.mcpb'));
const stage = await mkdtemp(path.join(os.tmpdir(), 'makevideo-mcpb-'));
try {
  await cp(path.join(here, 'manifest.json'), path.join(stage, 'manifest.json'));
  await cp(path.join(workspace, 'package.json'), path.join(stage, 'package.json'));
  await cp(path.join(workspace, 'src/ai-workflow.js'), path.join(stage, 'src/ai-workflow.js'));
  for (const file of ['server.mjs', 'bridge.mjs', 'app.mjs', 'package.json', 'package-lock.json', 'node_modules']) {
    await cp(path.join(here, file), path.join(stage, 'mcp', file), { recursive: true });
  }
  // Tests and the client library are not part of what the bundle runs.
  execFileSync('npm', ['prune', '--omit=dev', '--prefix', path.join(stage, 'mcp')], { stdio: 'inherit' });
  await writeFile(path.join(stage, '.mcpbignore'), '*.test.mjs\n');
  execFileSync('npx', ['-y', '@anthropic-ai/mcpb@2.1.2', 'pack', stage, output], { stdio: 'inherit' });
  console.log(output);
} finally {
  await rm(stage, { recursive: true, force: true });
}
