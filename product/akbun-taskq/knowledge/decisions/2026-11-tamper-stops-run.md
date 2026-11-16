---
type: Decision
title: A call that reaches taskq itself stops the run for review
description: Sandbox-off, data directory, taskq config and ~/.claude writes end the session; other denials only refuse the call.
tags: [agent-sdk, permissions, safety]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-16T00:00:00Z }
sources:
  - id: fable-multi-agent
    resource: https://claude.dev/blog/safely-scaling-multi-agent-teams-with-fable-5-2/
    title: Safely scaling multi-agent teams with Fable 5.2
---

## 결정

- `tamperOf`가 잡는 호출(`dangerouslyDisableSandbox`, data 디렉터리, `taskq.config.json`, `~/.claude` 쓰기)은 거부하고 run도 중단한다. task는 `failed`와 critical `security_finding`으로 남고, 사람이 run을 읽은 뒤 retry한다.
- 그 밖의 거부(유형별 정책, 일반 민감 경로)는 그 호출만 거부하고 세션은 계속한다.
- `PreToolUse` hook은 예외가 나면 deny한다(fail-closed).

## 이유

- 위 블로그의 multi-agent 실험은 sandbox 탈출, 경계 탐색, 감시 장치 변조를 노리는 호출이 block되면 팀을 멈추고 사람이 검토한 뒤에만 재시작했다[^fable-multi-agent]. taskq에서 감시 장치에 해당하는 것은 DB(이벤트와 승인 기록), config, Claude Code 설정(hook)이다.
- 거부만 하면 모델이 다른 경로로 같은 목적을 다시 시도할 수 있다. 이 4가지는 정상 작업에서 필요한 경우가 없어서 중단해도 오탐 비용이 작다고 판단했다.
- `.env`, `~/.aws` 같은 일반 민감 경로는 code task가 정상 작업 중에 건드릴 수 있어 중단 대상에서 뺐다. 중단 대상을 넓히면 사람 검토가 잦아져 알림이 무시된다.
- hook이 예외로 끝나면 SDK는 permission mode로 판단하고, `acceptEdits`와 `auto`는 그 호출을 허용할 수 있다.
- 블로그의 LLM 분류기와 CoT 감시, 오프라인 감시는 적용하지 않았다. 개인용 단일 프로세스에서 호출마다 모델을 한 번 더 부르는 비용이 크고, `research`와 `code`는 이미 `auto` 모드의 분류기를 거친다.
