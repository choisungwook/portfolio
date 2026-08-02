---
type: Decision
title: pptx import는 OOXML을 직접 파싱하고 검증은 생성기가 다른 corpus로 한다
description: PowerPoint 덱 import를 라이브러리 없이 공개 표준 파싱으로 구현하고, 단일 샘플 검증의 과적합을 corpus 교차 검증으로 막는 결정.
tags: [pptx, ooxml, rust, testing]
timestamp: 2026-08-02T00:00:00Z
---

## 결정

akbun-makepresentation의 pptx import는 OOXML(ECMA-376)을 quick-xml로 직접 파싱한다. PowerPoint 덱이 의존하는 네 가지 상속 체계 — schemeClr 테마 색(theme part + master clrMap), placeholder 박스(layout→master), 슬라이드 배경(slide→layout→master), sldSz 페이지 크기 — 를 reader가 해석한다. 검증은 한 파일이 아니라 생성기·크기·배경이 서로 다른 pptx corpus로 하고, 재수출본은 python-pptx 같은 독립 구현으로 교차 확인한다.

## 이유

- OOXML은 ECMA-376/ISO 29500 공개 표준이고 Microsoft Open Specification Promise가 구현을 허용한다. LibreOffice, python-pptx가 같은 근거로 존재하므로 직접 파싱에 법적 리스크가 없다. 추가한 의존성은 base64(MIT/Apache-2.0) 하나다.
- 이 앱이 쓴 파일만 읽던 reader는 PowerPoint 덱에서 그림 전체(p:pic), 테마 색 1만여 곳, placeholder 좌표 473곳을 버려 "글자만 보이는" import가 됐다. 명시값만 읽는 reader는 상속으로 표현된 덱 앞에서 반드시 깨진다.
- 첫 검증을 AWS 아이콘 덱 하나로 했더니 흰 배경·16:9라는 그 파일의 우연에 과적합했다. 다크 배경 덱은 흰 글자가 사라졌고 세로형 덱은 캔버스를 벗어났다. 서로 다른 생성기(PowerPoint, python-pptx, 자체 도구)와 크기(16:9, 4:3, 세로형), 배경(흰색, 다크)의 corpus가 이 세 구멍을 모두 잡았다.
- 배경과 페이지 크기는 모델을 바꾸지 않고 흡수했다. 흰색 아닌 배경은 페이지 크기 rect 한 장으로, 다른 페이지 크기는 비율 유지 스케일로 1280x720에 맞춘다. 모델 확장은 에디터·writer·pdf까지 번지므로 rect 근사가 훨씬 싸다.

## Citations

1. ECMA-376 Office Open XML File Formats, Microsoft Open Specification Promise
