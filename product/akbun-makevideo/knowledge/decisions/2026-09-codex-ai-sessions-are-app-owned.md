---
type: Decision
title: Codex AI 세션은 앱이 제한된 로컬 데이터로 소유한다
description: Codex thread는 일회성으로 사용하고 대화와 생성 이미지는 앱 데이터에 제한해 저장한다.
tags: [makevideo, codex, ai, session]
timestamp: 2026-09-05T00:00:00Z
---

# Codex AI 세션은 앱이 제한된 로컬 데이터로 소유한다

## 결정

* Codex App Server는 별도 설치된 CLI와 ChatGPT 로그인을 사용함
* Codex thread는 저장하지 않고 매 연결에서 새로 만듦
* 대화와 생성 이미지는 앱 데이터에 최대 3개, 세션당 128 MiB로 저장함
* 닫았거나 앱 재시작 뒤 복원한 세션은 읽기 전용으로 표시함
* 모델에는 경로와 미디어가 없는 프로젝트 요약만 전달함
* 생성 이미지는 세션에 보관하고 사용자가 별도 파일로 저장하게 함

## 이유

* 인증과 구독 상태를 Codex CLI 한 곳에서 관리함
* Codex 기록 정책과 무관하게 삭제와 용량 제한을 보장함
* 세션 이미지 경로를 프로젝트가 참조하면 세션 삭제 시 프로젝트가 깨지므로 자동 import하지 않음
* 실제 타임라인 편집 반영은 별도 편집 명령 설계와 검증이 필요함

## Citations

1. [Codex App Server AI ADR](../../adr/2026-09-codex-app-server-ai.md)
