---
type: Decision
title: AI 인증은 Codex를 재사용하고 대화는 앱이 소유
description: ChatGPT 인증만 Codex CLI에서 재사용하고 세션 수명과 자산은 앱에서 독립 관리.
tags: [desktop, ai, codex, storage, authentication]
timestamp: 2026-08-16T00:00:00Z
---

## 결정

- 별도 설치한 Codex CLI의 App Server로 ChatGPT 구독 인증만 재사용.
- API key와 앱 자체 로그인 기능은 제공하지 않음.
- App Server thread는 ephemeral로 생성하고 외부 도구를 비활성화.
- 앱 데이터에 최대 3개 세션을 저장하고 세션마다 이미지 포함 128 MiB로 제한.
- 종료·복원 세션은 읽기 전용으로 열고 삭제 시 이미지 디렉터리도 함께 삭제.
- 슬라이드 수정은 원본 다음에 검증된 복제본을 추가.

## 이유

- OAuth 토큰 파일을 직접 읽거나 복사하지 않고 지원되는 연동 경계 사용.
- Codex와 앱의 대화 기록·용량·삭제 정책을 분리.
- 세션 단위 디렉터리가 JSON과 이미지의 용량 계산 및 일괄 삭제에 적합.
- 읽기 전용 복원과 원본 슬라이드 보존으로 비정상 종료와 AI 결과 오류에서 복구 가능.

## Citations

1. [Codex App Server](https://learn.chatgpt.com/docs/app-server)
2. [Codex authentication](https://learn.chatgpt.com/docs/auth)
3. [Image generation](https://learn.chatgpt.com/docs/image-generation)
