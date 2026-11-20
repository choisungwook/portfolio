---
type: Decision
title: observer는 임시 디렉터리에서 도구와 설정을 끈 claude -p로 실행한다
description: observer 세션이 프로젝트 hook에 다시 기록되거나 사용자 설정에 오염되지 않도록 격리 장치를 겹쳐 둔다.
tags: [claude-code, hook, observer, memory]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T12:00:00Z }
sources:
  - id: claude-mem-hardened
    resource: https://github.com/thedotmack/claude-mem/blob/c1dc252bda98b1310ba3fa4b195efe49070d554b/src/sdk/hardened-options.ts
    title: claude-mem hardened-options.ts
---

## 결정

- `call_llm()`은 `tempfile.TemporaryDirectory()`를 `cwd`로 쓰고 `--tools=`, `--setting-sources=`, `--strict-mcp-config`, `--no-session-persistence`, `--system-prompt`를 붙인다.
- observer와 `Stop` hook이 띄우는 프로세스에는 `MINIMEM_DISABLE=1`을 주고, `minimem-hook`은 이 값이 있으면 바로 반환한다.
- `mcp__minimem__*`와 `ToolSearch` 호출은 `PostToolUse`에서 저장하지 않는다.

## 이유

- 프로젝트 디렉터리에서 가드 없이 `claude -p`를 실행하자 `sessions` 행이 4에서 5로 늘었다. observer 프롬프트가 사용자 세션으로 기록되는 재귀가 실제로 생긴다.
- 도구를 열어 둔 첫 구현의 observer는 자기 작업 디렉터리(`/tmp/...`)를 관찰 facts에 적었다. 원격 실행 환경에서는 환경이 주입한 commit 규칙이 요약의 "다음 할 일"에 들어갔다.
- 메모리 조회만 한 세션의 요약이 직전 세션의 의미 있는 요약을 덮어썼다. 컨텍스트에는 직전 요약 하나만 들어가므로 조회 기록은 남기지 않는다.
- claude-mem도 같은 이유로 `tools: []`, `settingSources: []`, cwd 분리를 겹쳐 둔다[^claude-mem-hardened].
