---
type: Decision
title: 외부 AI 편집은 로컬 MCP와 영속 복구 지점을 사용한다
description: 클라이언트 중립 도구를 기존 Document에 연결하고 변경 전 스냅샷을 디스크에 보관한다.
tags: [makevideo, mcp, editing, recovery]
timestamp: 2026-09-17T00:00:00Z
---

# 로컬 MCP와 복구 지점

## 결정

- Codex·Claude가 같은 stdio MCP 도구 사용
- Node 공식 MCP SDK와 실행 중인 Tauri 앱을 사용자 전용 Unix socket으로 연결
- 별도 로그인·토큰 없이 파일 시스템 권한으로 로컬 연결 범위 한정
- AI 명령을 기존 Rust Document에서 검증한 뒤 즉시 적용
- 변경 직전 프로젝트를 디스크에 저장하지 못하면 편집 중단
- 단일 명령 배치는 일반 Undo 한 단계, 여러 호출로 이루어진 작업은 시작 checkpoint ID로 복구
- 상태 토큰으로 수동 편집·다른 AI 클라이언트의 변경 감지
- 복구는 현재 상태도 먼저 보관하고 일반 Undo/Redo 이력 초기화
- 내보내기는 검증한 프로젝트 스냅샷을 렌더하며 결과 파일 자동 롤백 대상에서 제외

## 이유

- 내부 Astra 대화 세션과 외부 AI 클라이언트의 수명 분리
- 앱 종료 후에도 이전 편집 상태 복구
- UI와 외부 AI가 다른 편집 모델을 갖는 문제 방지
- 복구 파일은 미디어 사본이 아니므로 원본 파일 생명주기와 분리

## Citations

1. [로컬 MCP 구조](../../wiki/architecture/local-mcp.md)
2. [복구 사용법](../../docs/02-mcp-editing.md)
