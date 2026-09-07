# akbun-snspublisher

Write a post once, adapt it per channel, and publish it on schedule to X, LinkedIn, Threads, and Instagram. One user, one Cloudflare Worker, zero hosting cost.

The Worker serves the page and the JSON API from one hostname. Cloudflare Access guards the browser; Worker-issued API tokens guard automation. The structure is a copy of akbun-reader so the two products share their auth code and deploy path.

## Status

골격과 세 화면(작성, 대기열, 캘린더) 레이아웃을 목업 데이터로 배치. 초안 저장, 채널 검증, 예약 실행, 채널 연동은 후속 범위.

## Directory layout

| Directory | Description |
| --- | --- |
| `workspace/worker/` | Worker entry point (TypeScript): health, Access JWT and token verification |
| `workspace/migrations/` | D1 schema migrations applied with wrangler |
| `workspace/src/` | Plain HTML, CSS, and JavaScript served as-is by the assets binding. `channels.js` and `schedule.js` are DOM-free helpers |
| `workspace/test/` | node --test for the helpers and the Worker bundle |
| `wiki/` | Architecture and development notes |
| `adr/` | Architecture decision records |
| `knowledge/` | Durable product decisions and domain knowledge |

## Quick start

Start the local dev server:

```bash
cd workspace
npm install
npm run migrate:local
npm run dev
```

Run the tests and the type check:

```bash
npm test
npm run check
```

Deployment details are in [wiki/development.md](./wiki/development.md).
