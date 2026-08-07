---
type: Topic
title: move 클로저가 필드 이름을 대면 Send는 wrapper에 남고 클로저는 필드만 가져간다
description: 포인터를 Send wrapper로 감쌌는데도 스레드 경계를 못 넘을 때, 원인이 wrapper가 아니라 클로저의 캡처 단위라는 것과 필드 접근을 메서드로 바꿔 고치는 방법.
tags: [rust, tauri, objc2, macos]
timestamp: 2026-08-07T00:00:00Z
---

## 증상

`!Send`인 원시 포인터를 tuple struct로 감싸고 `unsafe impl Send`를 붙인다. 흔한 관용구다. 그런데 그 wrapper를 `move` 클로저에 넘기면 컴파일러가 wrapper가 아니라 안쪽 타입 이름을 대며 거절한다.

```
error[E0277]: `NonNull<NSView>` cannot be sent between threads safely
```

`unsafe impl Send for Handle`은 분명히 있는데 에러는 `Handle`이 아니라 `NonNull<NSView>`를 말한다. wrapper를 의심하게 되지만 wrapper는 멀쩡하다.

## 원인

edition 2021의 disjoint capture다. 클로저는 자기가 실제로 쓰는 경로만 캡처한다. 본문에 `handle.0`이라고 적혀 있으면 캡처 대상은 `handle`이 아니라 `handle.0`이고, `move`니까 그 필드가 값으로 넘어간다. `Send`는 `Handle`에만 붙어 있으므로 넘어간 `NonNull`에는 아무 보증이 없다.

즉 wrapper는 필드를 직접 만지지 않는 동안에만 wrapper다. 에러 메시지가 안쪽 타입을 가리키는 것은 정확한 신고다.

## 고치는 법

클로저가 wrapper 전체를 잡게 만든다. 필드 접근을 `self`를 값으로 받는 메서드 하나로 감싸면 그 호출이 wrapper 전체를 요구하므로 캡처 단위가 올라간다.

```rust
impl Handle {
    fn ptr(self) -> NonNull<NSView> {
        self.0
    }
}
```

클로저 첫 줄에 `let handle = handle;`을 넣어도 같은 효과지만, 쓰는 자리마다 반복되고 지우면 조용히 되돌아간다. 메서드는 필드를 쓰는 경로가 하나로 모여서 다음 사람이 `.0`을 다시 적을 자리가 줄어든다.

## 어디서 다시 만나는가

포인터를 스레드 사이로 옮기는 코드 전부다. 특히 AppKit처럼 "주소는 아무 데서나 들고 있어도 되지만 메시지는 메인 스레드에서만"인 API가 이 관용구를 강제한다. 컴파일러가 안쪽 타입을 지목하면 wrapper 정의가 아니라 클로저 본문의 점 뒤를 먼저 본다.
