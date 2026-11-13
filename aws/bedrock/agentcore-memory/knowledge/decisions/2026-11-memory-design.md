---
type: Decision
title: AgentCore Memory 핸즈온의 namespace, 프롬프트 주입, 채팅창 식별 방식
description: namespace는 모두 /actor/{actorId}/ 아래에 두고, 프롬프트에는 facts와 preferences만 넣으며, 채팅창은 X-Session-Id 헤더로 구분한다
tags: [bedrock, agentcore, memory, design]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-14T00:00:00Z }
---

## 결정

- 내장 전략 4개의 namespace를 모두 `/actor/{actorId}/` 아래에 둔다. facts, preferences는 session 없이, summaries만 `{sessionId}`를 넣는다. episodic reflection은 `/actor/{actorId}/`로 한 단계 위에 둔다.
- backend는 질문마다 facts, preferences namespace를 각각 topK 3으로 검색해 system 메시지에 넣는다. summaries는 넣지 않는다.
- 클라이언트는 질문 하나만 보내고, backend가 단기 메모리에서 최근 10 event를 복원한다. 채팅창은 `X-Session-Id` 헤더, 사용자는 OpenAI 요청의 `user` 필드로 구분한다.
- actorId와 sessionId는 소문자, 숫자, `-`, `_`, 64자 이내로 제한한다.

## 이유

- 경로 하나(`--namespace-path /actor/<id>/`)로 한 사용자의 record를 모두 조회, 삭제할 수 있다. 전략 기본 템플릿(`/strategy/{memoryStrategyId}/...`)을 쓰면 삭제가 전략 수만큼의 호출이 된다.
- 처음에는 `namespacePath=/actor/{actorId}/` 한 번으로 topK 5를 검색했는데, 긴 summaries record가 topK를 차지했고 `qwen2.5:3b`가 중국어로 답했다(2026-11-14). 대가로 검색이 턴당 2회가 되어, 사용자 1,000명 규모 추정에서 검색 비용이 월 300 USD에서 600 USD로 두 배가 된다. 큰 모델로 바꾸면 한 번 검색으로 되돌리는 것을 검토한다.
- actorId에는 `/`가 허용되므로 `jiwoo/facts` 같은 값이 다른 사용자 경로의 하위처럼 해석될 수 있다.
- OpenAI 스펙에는 대화 ID 필드가 없어 헤더를 썼다. 일반 OpenAI 클라이언트는 매 요청이 새 채팅창이 된다.
