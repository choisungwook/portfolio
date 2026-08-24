---
type: Decision
title: Codex 코딩 루프의 게이트는 저장소 안에서 실행한다
description: 종료 예정인 OpenAI Evals 플랫폼 대신 로컬 결정론적 테스트를 출시 게이트로 사용한다.
tags: [codex, eval, ci]
timestamp: 2026-08-25T00:00:00Z
---

# Codex 코딩 루프의 게이트는 저장소 안에서 실행한다

## 결정

- Codex는 `codex exec --sandbox workspace-write`로 후보 코드만 수정한다.
- train 테스트는 실패 이유를 제공한다.
- holdout 테스트는 통과 여부만 제공한다.
- OpenAI Evals, grader, dataset 기반 prompt optimizer를 CI 필수 의존성으로 사용하지 않는다.

## 이유

- OpenAI Evals 플랫폼은 2026년 10월 31일 읽기 전용, 11월 30일 종료 예정이다.
- 로컬 테스트는 코드와 함께 버전 관리되고 다른 실행 환경에서도 재현할 수 있다.
- 코치와 심판을 분리해야 테스트 변조와 holdout 과적합을 탐지할 수 있다.

## Citations

1. [OpenAI Evals 전환 일정](https://developers.openai.com/api/docs/guides/evals)
2. [OpenAI prompt optimizer 전환 일정](https://developers.openai.com/api/docs/guides/prompt-optimizer)
3. [OpenAI Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)
