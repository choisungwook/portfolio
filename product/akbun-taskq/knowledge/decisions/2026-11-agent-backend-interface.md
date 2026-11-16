---
type: Decision
title: Agent SDKs plug in behind one AgentBackend interface
description: createWorker, preflight and ask; the gate policy stays shared and each backend maps its own hook to it.
tags: [agent-sdk, architecture]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-16T00:00:00Z }
---

## 결정

- `src/agents/types.ts`의 `AgentBackend`(`createWorker`, `preflight`, `ask`)로 agent SDK를 감싸고, `config.agent`로 고른다. 첫 구현은 `claude`다.
- 도구 호출 정책(`gate.ts`), prompt, 결과 schema는 `src/worker/`에 공통으로 두고, backend는 자기 SDK의 hook과 권한 모델을 `decide`와 `tamperOf`에 연결하는 일만 한다.
- `provider`, `autoMode`, `sandbox`, `trustedRepos`는 claude backend 설정으로 그대로 둔다.

## 이유

- runner, API, DB가 이미 `Worker` 함수 하나와 preflight 함수만 받고 있어서, SDK에 묶인 곳은 worker 생성, preflight, retrospect의 짧은 질의 3곳이었다. 이 3개를 메서드로 두면 다른 SDK를 넣을 때 runner를 고치지 않는다.
- 정책을 backend마다 다시 쓰면 SDK별로 허용 범위가 달라진다. 승인과 변조 중단은 taskq의 안전 장치라서 한 파일에 두고, backend가 그 판정을 따르는지를 계약으로 정했다.
- 권한 모드와 sandbox는 SDK마다 개념이 달라 공통 설정으로 만들 수 없었다. 두 번째 backend가 생기면 공통으로 뽑을 수 있는 키를 그때 정한다.
- retrospect가 Claude SDK를 직접 부르던 것을 `ask`로 바꿨다. 도구 없는 단발 질의는 어느 SDK든 제공하므로 인터페이스에 넣을 수 있었다.
