# akbun-taskq workspace

Source, tests and the static UI of akbun-taskq, a personal agent task queue.

How to install, configure and use it is in the manual: [manual.md](./manual.md).

## Fastest look

Install, then open the URL the demo prints. The demo uses invented data and a paused queue, so no agent session starts.

```bash
npm ci
```

```bash
npm run demo
```

## For development

| Command | What it does |
|---|---|
| `npm run build` | Type check. Nothing is emitted; the sources run directly on Node 24 |
| `npm test` | All tests, with a fake worker and a fake SDK |
| `npm run test:critical` | Only the tests marked `[critical]`. Pull requests run these |

Design and development notes are in [../wiki/](../wiki/index.md).
