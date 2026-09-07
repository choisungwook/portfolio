---
type: Decision
title: 요청 단위 MCP와 기존 문서 API 재사용
description: SDK 전송과 Bearer 인증으로 도구 실행을 격리하고 기존 버전 검사를 유지
tags: [reader, mcp]
timestamp: 2026-09-07T00:00:00Z
---

## 결정

- SDK WebStandardStreamableHTTPServerTransport의 세션 없는 JSON 응답 사용
- /mcp는 API 토큰만 허용, 모든 요청에서 폐기 여부 확인
- 저장·태그 수정은 기존 문서 처리 함수를 호출, 태그 추가에 version 필수
- 삭제·OAuth·서버 알림 제외

## 이유

- Worker 인스턴스 간 세션 공유나 Durable Objects 없이 요청 처리 가능
- 도구 경로와 웹 경로의 검증·변경 기록 불일치 방지
- 기존 태그를 덮어쓰는 동시 수정 방지
- 실제 클라이언트가 Bearer를 지원하는지 배포 후 확인하기 전 OAuth 확장 보류
