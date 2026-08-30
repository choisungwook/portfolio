---
type: Decision
title: 모든 선형 도형은 arrowStart와 arrowEnd 하나로 끝을 표현
description: 자유도형의 penArrow 불리언을 없애고 선·화살표와 같은 두 끝 필드로 통일한 이유.
tags: [desktop, editor, model, pptx]
timestamp: 2026-08-16T12:10:00Z
---

## 결정

- 자유도형(pen)의 `penArrow` 불리언 필드를 모델에서 제거.
- 자유도형도 선과 화살표처럼 `arrowStart`, `arrowEnd`로 다섯 가지 끝(none, triangle, arrow, oval, diamond)을 가짐.
- pptx 쓰기의 `line_xml`에서 pen 분기를 없애고 `a:headEnd`/`a:tailEnd` 하나로 통일.
- 옛 프리셋 JSON의 `penArrow: true`는 읽을 때 `arrowEnd: 'triangle'`로 변환.

## 이유

- 같은 개념을 두 가지로 표현하면 렌더링, pptx 쓰기, pptx 읽기, 프리셋 정규화 네 곳이 각각 분기를 가짐. 자유도형에 끝 종류를 추가하는 요구가 오자 그 분기가 다섯 배로 늘어날 자리였음.
- `penArrow`는 pptx의 `a:tailEnd`를 불리언으로 축소한 값이었고, 파일 형식은 처음부터 두 끝을 이름으로 가지고 있었음. 모델을 파일 형식에 맞추는 쪽이 변환 코드가 없는 방향.
- 필드를 남긴 채 UI만 바꾸면 저장된 값 두 개가 서로를 덮어쓰는 상태가 생김.

## Citations

1. [.claude/rule-details/tauri.md](../../../../.claude/rule-details/tauri.md) - 순수 모델은 별도 crate에 두고 파일 형식 이름을 그대로 사용
