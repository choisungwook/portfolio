---
type: Decision
title: Astra 편집은 검토 가능한 명령 제안과 표본 B-roll 설명을 사용한다
description: 모델 출력을 Rust 편집 경계에서 검증하고 재사용 디자인은 파일 참조 없이 저장한다.
tags: [makevideo, astra, ai, editing]
timestamp: 2026-09-17T00:00:00Z
---

# Astra 편집 제안과 표본 B-roll 설명

## 결정

- 편집마다 새 Astra thread에 경로를 제거한 프로젝트와 자막 제공
- 모델의 명령 제안을 별도 Document에서 검증한 뒤 사용자 검토에 표시
- snapshot과 revision이 일치할 때 단일 undo transaction으로 적용
- B-roll은 선택한 60초 이하 구간에서 8개 프레임을 분석
- 원본 fingerprint가 바뀌면 분석 문맥에서 제외
- text/shape와 자막 스타일만 파일 의존성 없는 재사용 디자인으로 저장

## 이유

- 긴 모델 응답과 수동 편집이 동시에 진행되어도 오래된 명령 적용 방지
- 기존 compositor와 편집 불변식을 재사용해 미리보기·렌더 일관성 유지
- 샘플 사이의 움직임과 음성을 확인된 사실로 취급하지 않음
- 원본 경로와 대화 저장 수명에 디자인 재사용이 종속되지 않음

## Citations

1. [편집 스튜디오 구조](../../wiki/architecture/astra-editing.md)
2. [참고 영상](https://www.youtube.com/watch?v=mePPNdZ9lP0)
3. [Codex App Server](https://learn.chatgpt.com/docs/app-server)
