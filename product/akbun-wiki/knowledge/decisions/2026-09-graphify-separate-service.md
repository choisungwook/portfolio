---
type: Decision
title: graphify 빌더를 reader 밖의 별도 서비스로 분리
description: Worker에서 실행할 수 없는 graphify를 Python 서비스에 두고 reader는 읽기 전용 토큰과 변경 번호 API로만 연결
tags: [wiki, graphify, reader, auth]
timestamp: 2026-09-09T00:00:00Z
---

## 결정

- akbun-wiki는 reader의 /automation/changes를 읽기 전용 토큰으로 페이지 단위 동기화
- 원본은 raw/<id>.md 파일, wiki는 graphify export wiki 결과 파일, SQLite는 상태·키·검색 인덱스
- API 인증은 CLI에서 발급한 Bearer 키(read·admin), POST /api/sync는 admin만
- graphify는 외부 명령으로 호출, 테스트는 가짜 runner로 대체

## 이유

- graphify는 Python CLI에 디스크 캐시와 LLM 백엔드가 필요해 Worker(V8, CPU 10ms, 파일시스템 없음)에서 실행 불가
- 변경 번호 API는 CLI export용으로 이미 있어 reader에 새 endpoint 없이 두 번째 소비자 추가 가능
- 파일이 기준이면 LLM·Obsidian·git이 서비스 없이도 읽을 수 있고, DB는 언제든 재생성 가능
- Access는 호스트가 정해진 서비스에만 걸 수 있어 Bearer 키 하나로 검증하는 편이 작음
- 유출 시 피해 범위: reader 토큰은 조회, wiki read 키는 조회, admin 키만 LLM 비용 발생

## Citations

1. [akbun-reader 읽기 전용 토큰 결정](../../../akbun-reader/knowledge/decisions/2026-09-read-only-token-scope.md)
