---
type: Decision
title: LLM 백엔드는 모델 API가 아니라 agent 실행기 레벨에서 추상화한다
description: akbun-agent-analysiscode가 LangGraph류 모델 API 추상화 대신 Claude Agent SDK와 codex exec를 어댑터로 감싼 결정.
tags: [ai-agent, product]
timestamp: 2026-08-06T00:00:00Z
---

## 결정

AI agent 제품에서 여러 LLM 벤더를 지원할 때, LangGraph나 LiteLLM처럼 모델 API를 추상화하지 않고 벤더의 agent 실행기(Claude Agent SDK, codex exec subprocess)를 하나의 인터페이스(run(prompt, workdir, ...) -> 결과)로 감싼다. akbun-agent-analysiscode의 backends/ 모듈이 첫 구현이다.

## 이유

- 모델 API 추상화는 모든 벤더에 API 키 과금을 강제하고, 파일 탐색·도구 호출 같은 agentic loop를 직접 재구현하게 만든다. 실행기 레벨 추상화는 벤더별 인증(Agent SDK는 ANTHROPIC_API_KEY, codex는 CLI OAuth 로그인 재사용)과 검증된 loop를 그대로 쓰면서 --provider 플래그로 교체가 된다.

함께 확인한 제약: Anthropic은 Agent SDK 기반 앱에 claude.ai 구독 로그인 제공을 허용하지 않으므로, 구독제 재사용 설계는 시작하지 않는다. 상세는 [agent-backend-abstraction ADR](../../product/akbun-agent-analysiscode/adr/2026-08-agent-backend-abstraction.md) 참조.

## Citations

1. Claude Agent SDK overview - "Anthropic does not allow third party developers to offer claude.ai login" (https://code.claude.com/docs/en/agent-sdk/overview.md)
