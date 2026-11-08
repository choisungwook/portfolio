---
type: Decision
title: Rust 모듈은 테스트를 빼고 1000줄을 넘기지 않는다
description: 3000줄대 파일이 쌓인 뒤 src-tauri 전체를 주제별 하위 모듈로 나누며 정한 크기 상한과 분리 방식.
tags: [rust, refactor, code-structure]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-08T09:00:00Z }
---

## 결정

* src-tauri의 테스트가 아닌 .rs 파일은 1000줄 이하로 유지한다. 넘으면 기능을 고치는 김에 나눈다.
* 첫 단계는 inline `mod tests { ... }`를 `<모듈>/tests.rs`로 옮기는 것이다. 테스트 파일은 상한 대상이 아니다.
* 그래도 넘으면 주제별 하위 모듈로 나눈다. 자식은 `use super::*;`로 부모의 import와 private 항목을 그대로 쓰고, 부모는 `mod 자식; pub use 자식::*;`(공개 항목이 없으면 `use`)로 다시 내보내서 crate 밖 경로가 바뀌지 않게 한다.
* 자식으로 옮긴 private 함수와 inherent 메서드는 `pub(super)`로 올린다. crate root의 자식이면 이것이 원래의 crate 전체 가시성과 같다. trait impl의 메서드는 손대지 않는다.
* 큰 `impl` 하나는 같은 타입의 `impl` 블록을 자식에 하나 더 두는 방식으로 나눈다. 구조체 정의는 부모에 남겨서 private 필드를 그대로 생성할 수 있게 한다.

## 이유

* 3500줄 command.rs처럼 한 파일이 커지면 사람도 agent도 파일을 한 번에 읽지 못하고, 필요한 부분만 골라 읽다가 같은 파일 다른 곳의 불변식을 놓친다.
* `use super::*`와 glob 재수출 방식은 호출부를 하나도 고치지 않아서, 동작 변화 없이 diff를 이동으로만 채울 수 있다. 테스트와 clippy 경고가 그대로인지로 검증이 끝난다.
