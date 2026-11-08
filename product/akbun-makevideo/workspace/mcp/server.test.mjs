import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { request } from './bridge.mjs';
import { status, launch } from './app.mjs';

test('official MCP client discovers tools, validates input, forwards edits and receives images/errors', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mv-mcp-'));
  const endpoint = path.join(dir, 's');
  const calls = [];
  const bridge = net.createServer(socket => {
    socket.once('data', bytes => {
      const req = JSON.parse(bytes);
      calls.push(req);
      const response = req.method === 'sample_asset'
        ? {result:{assetId:'a',frames:[{timeMs:10,url:'data:image/jpeg;base64,AA=='}]}}
        : req.method === 'apply_edits'
          ? {error:'Project changed. Read get_project again before editing.'}
          : {result:{stateToken:'abc',document:{revision:0}}};
      socket.end(JSON.stringify(response)+'\n');
    });
  });
  await new Promise(resolve => bridge.listen(endpoint, resolve));
  const client = new Client({name:'compatibility-test',version:'1.0.0'});
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:[new URL('./server.mjs',import.meta.url).pathname],env:{...process.env,AKBUN_MAKEVIDEO_SOCKET:endpoint}}));
    const tools = (await client.listTools()).tools;
    assert.ok(tools.some(t=>t.name==='restore_checkpoint'));
    assert.ok(tools.some(t=>t.name==='export_video'));
    assert.equal(tools.length,21);
    const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
    assert.deepEqual(manifest.tools.map(t=>t.name).sort(), tools.map(t=>t.name).sort());
    const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
    assert.equal(manifest.version, pkg.version);
    const health = await client.callTool({name:'get_status',arguments:{}});
    assert.equal(JSON.parse(health.content[0].text).stateToken,'abc');
    const state = await client.callTool({name:'get_project',arguments:{}});
    assert.equal(JSON.parse(state.content[0].text).stateToken,'abc');
    const invalid = await client.callTool({name:'apply_edits',arguments:{stateToken:'abc',label:'cut',commands:[]}});
    assert.equal(invalid.isError,true);
    assert.equal(calls.length,2);
    const conflict = await client.callTool({name:'apply_edits',arguments:{stateToken:'old',label:'cut',commands:[{op:'splitAt',frame:5}]}});
    assert.equal(conflict.isError,true);
    assert.match(conflict.content[0].text,/Project changed/);
    const sampled = await client.callTool({name:'sample_asset',arguments:{assetId:'a',startMs:0,endMs:100}});
    assert.equal(sampled.content[2].type,'image');
    assert.equal(sampled.content[2].mimeType,'image/jpeg');
  } finally {
    await client.close();
    await new Promise(resolve=>bridge.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});

test('closed app yields an actionable error instead of hanging', async () => {
  await assert.rejects(request('get_project',{},'/tmp/nonexistent-makevideo-test.sock'),/Open the MCP-enabled app/);
});

test('status reports a closed app and launch waits until it answers', async () => {
  const unreachable = () => Object.assign(new Error('Cannot reach akbun-makevideo.'), { code: 'UNREACHABLE' });
  assert.equal((await status(() => Promise.reject(unreachable()))).running, false);
  // An older editor answers with an error: it is running, not closed.
  assert.equal((await status(() => Promise.reject(new Error('Unknown method get_status')))).running, true);
  let opened = false;
  const call = async () => { if (!opened) throw unreachable(); return { running: true, appVersion: '1' }; };
  if (process.platform === 'darwin') {
    const result = await launch({ call, open: async () => { opened = true; }, intervalMs: 5, timeoutMs: 500 });
    assert.equal(result.launched, true);
  }
  const already = await launch({ call: async () => ({ running: true }), open: async () => assert.fail('must not open') });
  assert.equal(already.launched, false);
});
