---
type: Topic
title: macOS 메뉴바 status item은 넓은 자리 차지로만 가릴 수 있고, 목록은 프로세스 단위로만 읽을 수 있다
description: 다른 앱의 메뉴바 아이콘을 다루는 두 가지 제약과, 각각에 대해 검증된 우회 방법.
tags: [macos, electron, accessibility, applescript]
timestamp: 2026-07-31T00:00:00Z
---

## 다른 앱의 아이콘은 숨길 수 없고, 밀어낼 수만 있다

macOS는 다른 앱의 status item을 숨기거나 옮기는 API를 제공하지 않는다. 유일하게 동작하는 방법은 자기 소유의 넓은 status item으로 자리를 차지해 왼쪽 아이콘들을 화면 밖으로 밀어내는 것이다. macOS는 자리에 들어가지 않는 status item을 그냥 그리지 않는다. Dozer, Hidden Bar, Ice가 모두 이 방식이며 `NSStatusItem.length`를 조절한다.

Electron은 length를 노출하지 않지만 `setTitle`은 노출한다. 공백 문자 하나가 약 4pt이므로 화면 너비만큼의 공백 제목이 같은 효과를 낸다. 1728pt 화면에서 실측한 자기 아이콘 x 좌표다.

```text
spacer 둘 다 확장   -5376  -2262    852
spacer 하나만 확장  -2282    832    849
spacer 둘 다 축소     818    835    852
```

구분자 두 개를 두면 구간이 셋이 되고, 상태를 순환시키면 아이콘이 많을 때 한 구간씩 넘겨 보는 페이징이 된다.

어떤 아이콘이 어느 구간에 속하는지는 앱이 정할 수 없다. status item 순서는 macOS가 소유하고 사용자가 Command 드래그로 바꾼 뒤 시스템이 기억한다. 앱이 따로 저장하면 쓸 수 없는 상태를 두 곳에서 관리하게 된다.

## 목록은 accessibility API를 프로세스 단위로 물어봐야 한다

앱 전체의 status item을 나열하는 API도 없다. accessibility API가 소유 프로세스별로 노출하고, osascript로 네이티브 모듈 없이 닿을 수 있다.

한 스크립트가 모든 프로세스를 순회하면 2분 34초가 걸린다. 호출이 직렬이고 응답 없는 앱 하나가 루프 전체를 막는다. 프로세스 이름을 지정한 호출은 150ms다. 그래서 프로세스 목록을 한 번에 받아 프로세스마다 짧은 osascript를 병렬로 돌리면 10초가 된다. 호출마다 timeout을 두면 멈춘 앱의 비용이 실행 전체가 아니라 슬롯 하나로 끝난다.

동시 실행을 8에서 16으로 올리면 더 빨라지지만 결과가 19개에서 13개로 줄어든다. accessibility 호출끼리 경합해 느린 프로세스가 timeout에 걸리고 항목이 조용히 사라진다. 이 영역에서 병렬도를 올리는 것은 정확도와의 교환이다.

status item은 애플리케이션 메뉴가 있는 앱에서는 `menu bar 2`, 메뉴가 없는 agent에서는 `menu bar 1`에 있다. `menu bar 1`에는 애플리케이션 메뉴와 꺼진 시스템 항목의 자리표시자(x가 0)가 섞여 있어 위치로 걸러야 하지만, `menu bar 2`는 전부 status item이라 위치로 거르면 안 된다. 화면 밖으로 밀린 항목은 음수 x로 계속 보고되므로, 보이지 않는 아이콘을 목록에 남기는 근거가 된다.

자리가 없어 밀려난 아이콘은 에러 없이 사라진다. 이 앱은 그 동작을 일부러 쓰지만, 의도하지 않은 쪽에서 겪으면 원인을 찾기 어렵다. 자기 tray가 안 보일 때의 진단은 [Electron 메뉴바 앱은 창 정리와 메뉴바 공간에서 조용히 실패한다](electron-menubar-silent-failures.md)에 있다. 자기 아이콘 하나의 좌표만 필요하다면 osascript 대신 `tray.getBounds()`로 충분하다.

구현: [akbun-mactaskbar](../../product/akbun-mactaskbar/)
