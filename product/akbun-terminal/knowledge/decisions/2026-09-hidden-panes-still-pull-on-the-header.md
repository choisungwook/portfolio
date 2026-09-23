---
type: Decision
title: 숨긴 패널의 constraint는 살아 있으므로 헤더의 hugging을 명시한다
description: 한 헤더 아래에 여러 패널을 겹쳐 두고 isHidden으로 바꾸는 구조에서, 숨긴 패널의 constraint가 헤더 높이를 끌어당겨 헤더가 패널 전체를 채운 버그의 원인과 규칙.
tags: [swift, appkit, autolayout, verification]
timestamp: 2026-09-16T00:00:00Z
---

## 결정

- 헤더 역할의 NSStackView는 세로 hugging priority를 `.defaultHigh` 이상으로 명시한다. 기본값 250에 맡기지 않는다.
- 중첩 NSSplitView는 처음 보이는 순간 `setPosition`으로 divider를 한 번 놓는다. holding priority만으로 초기 분할을 기대하지 않는다.
- 한 뷰에 패널을 겹쳐 두고 `isHidden`으로 바꾸는 구조에서 패널을 추가하면, 보이는 상태만이 아니라 숨긴 상태에서 남는 constraint까지 본다.
- NSSplitView에서 패널을 접으면 `splitView(_:shouldHideDividerAt:)`에서 그 패널 쪽 divider를 숨긴다.

## 이유

- v0.13.0의 오른쪽 패널에서 헤더(제목, 세그먼트 컨트롤, 새로고침)가 패널 세로 가운데로 내려오고 파일 목록이 사라졌다. Git 세그먼트용 NSSplitView는 숨겨져 있어도 arranged subview의 높이를 마지막 크기(한 번도 보인 적 없으면 0)로 붙드는 constraint를 250으로 건다. 헤더 stack의 hugging도 250이라 동점이었고, 엔진이 헤더를 늘리는 쪽을 고르면 목록의 높이가 0이 된다.
- 동점은 실행마다 다르게 풀릴 수 있어 PR 검증에서 재현되지 않았다. 우선순위를 명시하면 어느 쪽이 이겨야 하는지 코드에 남는다.
- v0.15.0에서 좌우 패널을 접으면 패널 자리에 1pt 세로선이 남았다. 접힌 arranged subview의 divider는 기본값으로 계속 그려지기 때문이다.
- NSSplitView의 holding priority 기본값이 이미 `.defaultLow`라서 `setHoldingPriority(.defaultLow, forSubviewAt: 0)`은 아무것도 바꾸지 않았다. 나무가 양보하고 상세가 높이를 지키려면 나무 쪽을 그보다 낮게 둬야 한다.
