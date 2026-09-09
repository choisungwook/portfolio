---
type: Decision
title: 외부 동기화용 읽기 전용 API 토큰
description: 토큰에 scope 열을 두고 read 토큰은 GET·HEAD만 통과시켜 다른 서비스에 건네는 자격증명의 피해 범위를 조회로 제한
tags: [reader, auth, wiki]
timestamp: 2026-09-09T00:00:00Z
---

## 결정

- api_tokens.scope는 read 또는 write, 기본 write, 발급 후 변경 불가
- read 토큰은 /api·/automation의 GET·HEAD만 허용, 변경 요청과 /mcp는 403
- 변경 번호 API(/automation/changes)를 외부 동기화 계약으로 재사용, 새 API 없음
- graphify wiki 빌더(akbun-wiki)는 read 토큰만 보관

## 이유

- 다른 기기에 두는 자격증명은 유출을 전제로 설계; write 토큰 유출은 저장·태그·보관 변경까지 허용
- MCP 도구를 scope별로 거르면 도구 등록이 둘로 갈라짐; /mcp 자체를 거부하면 계약이 그대로
- scope 변경을 막으면 토큰의 상태 변화는 폐기 하나뿐이라 설정 화면과 테스트가 단순
- graphify는 Python CLI라 Worker 안에서 실행 불가, 그래서 별도 앱이 원본을 끌어가는 구조가 필요

## Citations

1. [akbun-wiki 아키텍처](../../../akbun-wiki/wiki/architecture.md)
