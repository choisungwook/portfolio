---
type: Decision
title: 학습지 HTML은 핸즈온 workspace 안에 둔다
description: akbun-studysheet skill의 Downloads 저장 규칙 대신 핸즈온 workspace 루트에 studysheet.html로 둔다.
tags: [handson, documentation, studysheet]
timestamp: 2026-07-26T00:00:00Z
---

## 결정

akbun-studysheet skill로 만든 학습지 HTML은 skill이 지정한 `$HOME/Downloads/<주제-slug>/studysheet-<주제-slug>-v{n}.html` 대신, 핸즈온 workspace 루트에 `studysheet.html`로 저장한다. 스타일과 뼈대(템플릿의 CSS/JS, 문제 → 원리 → 핸즈온 → 결론 구조)는 skill을 그대로 따른다.

## 이유

- 학습지가 핸즈온 본문 역할을 하므로 실습 코드와 같은 커밋에서 함께 버전 관리되어야 한다. Downloads에 있으면 저장소에 남지 않는다.
- `/repo-handson`이 학습지를 workspace에 두라고 지시한다. 두 규칙이 충돌하면 저장소 규칙을 우선한다.
- 버전 관리는 파일명 v1/v2가 아니라 git history가 담당하므로 파일명에 버전을 붙이지 않는다.

## 확인 사항

템플릿은 한 장이 16:9 슬라이드다. 내용이 넘치면 슬라이드 안에 스크롤이 생기므로, 만든 뒤 브라우저에서 장마다 `scrollHeight - clientHeight`가 0인지 확인하고 넘치면 장을 쪼갠다.

관련: [새 핸즈온 추가 절차](../playbooks/add-new-hands-on.md)
