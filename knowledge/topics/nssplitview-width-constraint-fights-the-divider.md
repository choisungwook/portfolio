---
type: Topic
title: NSSplitView의 pane 너비는 divider 위치로 정하고 제약으로 정하지 않는다
description: 드래그가 안 먹는 split view는 hit 영역이 1pt라서이고, 너비 제약을 얹으면 pane이 0이 되거나 드래그가 되돌아간다.
tags: [macos, appkit, swift, ui]
timestamp: 2026-08-20T00:00:00Z
---

akbun-terminal의 좌우 패널이 "고정"이라는 보고를 받고 원인을 실측으로 갈라냈다. 코드는 이미 NSSplitView였고 `setPosition`은 모든 구성에서 잘 동작했다. 실제 원인은 두 가지였고 둘 다 제약과 관련이 없었다.

## 드래그가 시작되지 않는 이유는 hit 영역이다

`dividerStyle = .thin`은 1pt 선을 그린다. 사람이 1pt를 겨냥할 수 없으므로 드래그가 아예 시작되지 않고, 화면상으로는 고정된 패널과 구별되지 않는다. 그린 선은 그대로 두고 마우스에 답하는 영역만 넓히는 delegate 항목이 따로 있다.

```swift
func splitView(
  _ splitView: NSSplitView, effectiveRect proposedEffectiveRect: NSRect,
  forDrawnRect drawnRect: NSRect, ofDividerAt dividerIndex: Int
) -> NSRect {
  proposedEffectiveRect.insetBy(dx: splitView.isVertical ? -4 : 0, dy: 0)
}
```

## 너비 제약은 holding priority와 같은 수를 두고 다툰다

빈 창에 3-pane split view를 만들고 조합별로 초기 너비, 드래그 결과, 창 크기 변경 후를 찍어 보면 갈린다.

| 구성 | 초기 너비 | 400으로 드래그 | 창 확대 후 |
|---|---|---|---|
| 너비 제약 250 + 최소 제약 required | 170 | 400 | 400 |
| 너비 제약 270 + 최소 제약 required | 240 | 240 | 240 |
| 제약 없음 + `setPosition` 착석 | 240 | 400 | 400 |

holding priority가 260이므로 그보다 낮은 제약은 무시되어 pane이 required 최소값(또는 0)으로 열리고, 높은 제약은 드래그를 되돌린다. 어느 쪽이든 원하는 값이 나오지 않는다. 시작 너비는 첫 layout 뒤 `setPosition(_:ofDividerAt:)`으로 한 번 앉히고, 최소 크기는 `constrainMinCoordinate`/`constrainMaxCoordinate`로 답한다. required 제약으로 최소를 걸면 그 선을 넘는 드래그가 제약을 깨뜨려야 끝나므로 delegate 쪽이 맞다.

인자 이름이 `ofSubviewAt`인 것도 함정이다. `ofDividerAt`으로 쓰면 컴파일은 되고 near-miss 경고만 남으며 메서드는 호출되지 않는다.

관련: [[2026-08-typed-boundary-before-process-boundary]]
