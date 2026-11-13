---
type: Decision
title: 판단 기록은 spend_logs_metadata 목록에, 질문은 해시로만 남긴다
description: decision trail을 dict가 아닌 목록으로 쌓고, 원문 대신 sha256 앞 16자와 글자 수를 남긴다
tags: [litellm, observability, privacy]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-13T03:40:00Z }
---

## 결정

- 11단계부터 훅과 provider의 판단은 `spend_logs_metadata.decisions` 목록에 `{"hook", "detail"}`로 추가한다. 3~10단계 config는 기존 dict 병합을 유지한다(`TrailStart` 훅이 목록을 만들 때만 목록 모드).
- 질문은 `question_sha256`(앞 16자)과 `question_chars`만 남긴다. 분류 캐시 key도 질문 해시다.
- custom provider는 `kwargs["litellm_params"]["metadata"]`에 기록한다.

## 이유

- 5단계 실행에서 순서가 다른 두 훅 체인의 spend log가 글자까지 같았다. Postgres `jsonb`가 key를 정렬해 저장하므로 dict로는 실행 순서를 복원할 수 없다.
- provider 안에서 부른 모델·분류 호출은 spend log 행을 만들지 않는다(6·8단계 실측). 바깥 요청 행에 판단을 남기지 않으면 어느 검색이 답했는지 알 길이 없다.
- provider가 받는 `litellm_params["metadata"]`가 로깅 객체의 dict와 같은 객체임을 `is` 비교와 spend log 조회로 확인했다. 버전이 바뀌면 이 전제부터 다시 확인한다.
- post_call 훅은 스트리밍에서 실행되지 않는다(11단계 실측). 응답 마스킹을 보안 통제로 쓰려면 스트리밍 경로를 따로 구현해야 한다.
