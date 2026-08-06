---
type: Decision
title: 멀티 제품 저장소의 What's Changed는 제품 접두사로 이전 tag를 고정한다
description: generate-notes 호출에 제품 tag 접두사로 계산한 previous_tag_name을 명시해, 다른 제품 릴리스가 변경 목록을 오염시키지 않게 한 결정.
tags: [github-actions, release, workflow]
timestamp: 2026-08-06T00:00:00Z
---

## 결정

release workflow가 릴리스 노트에 What's Changed를 붙일 때 GitHub generate-notes API에 `previous_tag_name`을 명시한다. 값은 `gh release list`를 자기 제품 접두사(예: `akbun-requesthttp-v`)로 필터해 얻은 직전 릴리스 tag다. 첫 릴리스처럼 직전 tag가 없으면 `previous_tag_name` 없이 호출한다. 접두사 필터는 `-v`까지 포함해야 고정 updater tag(`<제품>-updater`)가 걸리지 않는다.

## 이유

generate-notes는 `previous_tag_name`이 없으면 저장소 전체에서 직전 tag를 자동 선택한다. 이 저장소는 여러 제품이 각자 tag를 만들므로 자동 선택은 대부분 **다른 제품의 마지막 릴리스**를 가리키고, 변경 목록은 남의 제품 PR을 포함하거나 자기 제품의 실제 변경 구간을 놓친다. 실패는 조용하다: 릴리스는 초록이고 노트도 그럴듯해 보인다.

akbun-requesthttp workflow가 이 방식을 처음 적용했다. 먼저 만들어진 akbun-makepresentation workflow는 아직 자동 선택에 의존하므로 같은 수정 대상이다. 릴리스와 tag를 다루는 관련 결정: [릴리스 버전은 태그에서 계산한다](2026-07-release-version-from-tags.md).
