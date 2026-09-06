---
type: Decision
title: 잘라내기는 시스템 복사 성공 후 원본을 지운다
description: 네이티브 클립보드에 PNG·텍스트·개체 JSON을 함께 기록하고 성공한 뒤에만 변경되지 않은 원본을 삭제.
tags: [desktop, editor, clipboard, javascript]
timestamp: 2026-09-06T00:00:00Z
---

## 결정

- 데스크톱 복사와 잘라내기는 같은 비동기 시스템 클립보드 기록 경로 사용.
- PNG·일반 텍스트·편집용 JSON을 한 번에 기록.
- 브라우저 미리보기에서만 copy 이벤트와 execCommand 사용.
- PNG를 만드는 동안 원본 객체나 문서가 바뀌면 잘라내기 삭제 생략.
- 입력 필드의 복사·잘라내기는 네이티브 텍스트 동작 유지.

## 이유

- 앱 전용 MIME만 기록하면 외부 앱이 도형을 받아들이지 못함.
- 형식별로 따로 기록하면 뒤의 기록이 앞의 이미지나 JSON을 지움.
- 비동기 기록 실패를 기다리지 않고 삭제하면 복구할 클립보드가 없는 상태로 원본 손실.

관련: [문서 프로세스와 프로필 분리](2026-09-document-process-and-profile-isolation.md)
