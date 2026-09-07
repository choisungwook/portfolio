import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'reader-cpu-'));
const bundle = await build({
  stdin: {
    contents: `import { extractHtml } from './worker/extraction/html.ts';
      export default { async fetch(request) {
        const {html, iterations} = await request.json();
        let result;
        for (let i = 0; i < iterations; i++) result = extractHtml(html);
        return Response.json({ length: result.body.length });
      } };`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
  },
  bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], write: false,
});
const runtime = new Miniflare(convertV4MiniflareOptions({
  name: 'reader-extraction-benchmark', modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-09-01', inspectorPort: 0, cf: false, unsafeDevRegistryPath: directory,
}));
let socket;
try {
  await runtime.ready;
  const inspector = await runtime.getInspectorURL();
  inspector.protocol = 'http:'; inspector.pathname = '/json/list';
  const targets = await (await fetch(inspector)).json();
  const target = targets.find(target => target.id === 'core:user:reader-extraction-benchmark');
  if (!target) throw new Error('Benchmark Worker inspector not found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const waiting = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const pending = waiting.get(message.id);
    if (pending) { waiting.delete(message.id); clearTimeout(pending.timer); message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result); }
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => { waiting.delete(current); reject(new Error('Profiler timeout')); }, 10_000);
      waiting.set(current, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: current, method, params }));
    });
  }
  await command('Profiler.enable');
  await command('Profiler.setSamplingInterval', { interval: 100 });
  const article = '<article><h1>Long reading</h1>' + '<p>Useful reading notes and practical examples.</p>'.repeat(1500) + '</article>';
  const fixtures = [
    ['100KB', article + '<script>' + 'x'.repeat(100_000 - article.length - 17) + '</script>'],
    ['256KB', article + '<script>' + 'x'.repeat(256_000 - article.length - 17) + '</script>'],
    ['many-elements', '<article>' + '<p><em>Readable content</em> with detail.</p>'.repeat(1800) + '</article>'],
  ];
  for (const [name, html] of fixtures) {
    const run = iterations => runtime.dispatchFetch('http://benchmark.local', { method: 'POST', body: JSON.stringify({ html, iterations }) });
    await (await run(10)).text();
    const results = [];
    for (let round = 0; round < 3; round++) {
      await command('Profiler.start');
      const response = await run(100);
      if (!response.ok) throw new Error(await response.text());
      await response.text();
      const { profile } = await command('Profiler.stop');
      const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame.functionName]));
      let active = 0;
      for (let i = 0; i < profile.samples.length; i++) {
        if (!['(idle)', '(program)'].includes(nodes.get(profile.samples[i]))) active += profile.timeDeltas[i];
      }
      if (!active) throw new Error('No active CPU samples captured');
      results.push(Number((active / 100 / 1000).toFixed(3)));
    }
    console.log(JSON.stringify({ fixture: name, bytes: Buffer.byteLength(html), runtime: 'local workerd CPU profiler', mean_cpu_ms_per_extraction: results }));
  }
} finally {
  socket?.close();
  await runtime.dispose();
  await rm(directory, { recursive: true, force: true });
}
