---
type: Decision
title: 슬라이드 크기는 덱의 픽셀 좌표계
description: 슬라이드 크기를 덱 단위 픽셀 값으로 저장하고 cm와 PPTX 단위를 경계에서 변환.
tags: [desktop, editor, slide-size, pptx]
timestamp: 2026-08-16T00:00:00Z
---

## 결정

- slideWidth와 slideHeight를 덱의 기준 좌표계로 저장.
- cm 입력은 96ppi로 픽셀 변환.
- PPTX의 EMU 크기를 픽셀로 왕복해 원본 비율 유지.
- 크기 변경 시 기존 도형 좌표와 크기 유지.

## 이유

- 편집 화면, 썸네일, 발표, 이미지와 문서 내보내기가 같은 좌표계 공유.
- 1px당 9525EMU 변환으로 픽셀과 cm 모두 PPTX 실제 크기에 일관되게 대응.
- 슬라이드 경계 변경과 콘텐츠 변형을 분리해 예기치 않은 도형 왜곡 방지.
