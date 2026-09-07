# akbun-reader

A personal reading archive for one user. Share a URL from an iPhone, tag it, read it on any device, and mirror it into an Obsidian vault. Built to replace a paid read-later subscription at a hosting cost of zero.

One Cloudflare Worker serves the static page, the JSON API, and later the MCP endpoint. D1 holds the documents. Cloudflare Access guards the browser; Worker-issued API tokens guard shortcuts, the CLI, and MCP clients.

## Status

웹 읽기 보관함·태그·토큰 API·PWA·AI 요약 구현. 배포와 실제 Access 설정은 별도 작업. URL 본문 자동 추출 구현. CLI, MCP, 기존 데이터 이관은 후속 범위.

- [공유 URL 추출·CPU 측정](wiki/url-extraction.md)
- [화면·API·AI 설정](wiki/reader-ui-ai.md)
- [로컬 환경 준비](wiki/development.md)

## Directory layout

| Directory | Description |
| --- | --- |
| `workspace/worker/` | Worker entry point (TypeScript) and pure helpers under `lib/` |
| `workspace/migrations/` | D1 schema migrations applied with wrangler |
| `workspace/src/` | Plain HTML, CSS, and JavaScript served as-is by the assets binding |
| `workspace/test/` | URL·API·인증·AI 테스트 |
| `wiki/` | Architecture and development notes |
| `adr/` | Architecture decision records |
| `knowledge/` | Durable product decisions and domain knowledge |

## Quick start

로컬 환경을 시작합니다.

```bash
cd workspace
npm install
npm run migrate:local
npm run dev
```

테스트와 타입 검사를 실행합니다.

```bash
npm test
npm run check
```

Deployment details are in [wiki/development.md](./wiki/development.md).
