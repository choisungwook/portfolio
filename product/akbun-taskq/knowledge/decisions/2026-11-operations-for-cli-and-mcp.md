---
type: Decision
title: The CLI and MCP server reach every route through one table of operations
description: Each API route is a named operation; taskq api and the MCP tools taskq_<operation> call the route in their own process against the same database, and a test fails when a route has no operation.
tags: [cli, mcp, api]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T23:00:00Z }
---

## 결정

- `src/ops/operations.ts`에 API 경로마다 이름, 메서드, 경로, 설명을 둔다. `taskq api <operation> key=value...`와 MCP 도구 `taskq_<operation>`이 같은 표를 쓴다.
- operation은 HTTP 서버를 거치지 않고 같은 프로세스 안에서 Hono 앱을 불러 처리한다(`ops/local-api.ts`). 검증과 효과는 UI와 같다.
- 실행 중인 taskq만 할 수 있는 일은 DB에 표시를 남긴다. bot 취소는 `meta.bot_cancel:<name>`, task 취소는 기존 cancel marker이고, bot과 runner가 다음 tick에 읽는다.
- `taskq workflows`처럼 자주 쓰는 영역은 읽기 좋은 명령을 따로 두되, 안에서는 같은 operation을 부른다.
- `test/ops-coverage.test.ts`가 operation 없는 경로를 찾으면 실패한다. UI의 실시간 이벤트 stream만 예외다.

## 이유

- 사용자는 이 세션에서 만든 모든 기능을 CLI와 MCP로도 쓰기를 원했다. 기능마다 CLI 명령과 MCP 도구를 손으로 따로 만들면 경로가 늘 때마다 셋 중 하나가 빠진다. 표 하나와 coverage 테스트로 빠짐을 테스트 실패로 바꿨다.
- 실행 중인 서버의 HTTP를 부르는 방법도 있었지만, 토큰이 서버 메모리에만 있고(시작할 때마다 새로 만듦) 서버가 꺼져 있으면 아무것도 못 한다. 같은 SQLite를 여는 편이 서버 없이도 동작하고 토큰을 디스크에 둘 필요가 없다.
- 프로세스 사이 신호는 이미 task 취소가 DB marker로 하고 있어서 같은 방식을 bot 취소에 썼다. 지연은 hub의 `pollSec`만큼이다.
- 대가로 operation 인자는 경로 매개변수만 스키마로 선언하고 나머지는 설명에 적는다. 경로 handler가 다시 검증하므로 잘못된 값은 400으로 돌아온다.

관련: [Workflows are step graphs a bot executes](2026-11-workflows-run-by-bots.md)
