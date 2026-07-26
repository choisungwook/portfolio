---
type: Decision
title: 모델 우선 - 진실의 원본은 JSON이고 HTML은 export 산출물이다
description: DOM 직접 편집, PPTX 변환, Figma 전송 대안을 검토한 끝에, 학습지를 한 번 임포트해 JSON 모델로 관리하고 HTML은 export로만 만드는 model-first 구조를 선택했다.
tags: [architecture, editor, model-first, akbun-PPTEditorFromHTML]
timestamp: 2026-07-26T00:00:00Z
---

## 결정

문서의 진실의 원본은 ~/Documents/akbun-PPTEditorFromHTML/의 JSON 모델(SheetDoc)이다. 학습지 HTML은 최초 임포트 때 한 번만 읽고, 이후 모든 편집은 모델 위에서 일어난다. HTML은 export 산출물이며, 같은 모델에서 나중에 pptx도 뽑을 수 있다(v0.3 로드맵). 모델은 페이지 목록과 페이지별 객체 목록이고, 객체는 슬라이드 대비 % 좌표(x/y/w)와 원본 요소의 outerHTML 조각을 갖는다.

## 이유

- 사용자 인터뷰에서 편집 후에도 퀴즈·페이지 넘김이 살아 있는 HTML 학습지가 최종 산출물이어야 한다고 확정됐다. HTML→PPTX 변환 후 PowerPoint에서 편집하는 대안은 에디터를 안 만들어도 되지만 인터랙션이 죽고 편도라서 탈락. Figma 전송은 편집 후 출구(동작하는 HTML)가 없어서 탈락.
- DOM을 직접 편집하고 outerHTML로 저장하는 방식은 가장 빨리 띄울 수 있지만 알려진 약점이 있다: undo/redo가 어렵고, 편집 UI 잔여물이 저장 파일에 새어 들어가고, 브라우저가 HTML을 정규화한다. 슬라이드 에디터 업계 표준(Google Slides, Figma, Slides.com)이 model-first인 이유가 이 약점들의 해소다.
- 학습지는 컴포넌트 어휘가 고정된 제약 포맷이라 HTML→모델 파서가 저렴하다. model-first의 최대 비용(파서)이 이 도메인에서는 거의 없다.
- undo/redo는 모델 스냅샷으로 공짜가 되고(v0.2), export는 모델→문자열 생성이라 출력이 항상 결정적이다.
- 객체 내용을 typed 구조가 아니라 HTML 조각으로 둔 것은 의도된 절충이다. 퀴즈의 data-answer 같은 세부를 전부 보존하면서 v0.1 범위를 좁힌다. 퀴즈 전용 편집 UI(v0.3)가 생기면 그 부분만 구조화한다.
