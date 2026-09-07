---
type: Decision
title: CLI 자동화 경로와 재실행 가능한 export·import
description: 브라우저 인증과 토큰 경로를 분리하고 DB 원본·메모·이관 메타데이터 보존
tags: [reader, cli, sync, import]
timestamp: 2026-09-07T00:00:00Z
---

## 결정

- Access 브라우저 경로는 /api, Bearer 전용 자동화 별칭은 /automation
- keyring 4의 v1 인터페이스로 플랫폼 기본 보안 저장소 사용
- 콜백은 정확한 Origin·Host와 state를 검사한 POST, CORS는 해당 서비스 origin만 허용
- 변경 번호 페이지 반영 후 상태 저장; 기존 사용자 메모 영역 보존, 삭제는 tombstone 파일
- CSV 열 매핑·원본 저장일 보존, 중복 URL은 기존 내용 유지
- import는 AI 비활성화, UTC 날짜별 3,000건 상한

## 이유

- 전체 사이트 Access가 자동화 요청을 로그인 페이지로 보내는 문제 분리
- 평문 토큰 저장과 다른 웹사이트의 콜백 요청 방지
- 파일 쓰기 중단 후 재실행해도 누락·메모 삭제 방지
- 실제 CSV 형식 확인 전 임의 열 추정과 조용한 데이터 유실 방지
- 이관으로 유료 AI 호출이나 대량 자동 본문 fetch 발생 방지
