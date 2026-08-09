---
type: Topic
title: crate마다 step을 나눈 verify job은 첫 실패에서 멈추므로 파손 범위를 보여주지 않는다
description: 공유 struct에 필드를 추가했을 때 CI가 보고한 컴파일 에러 개수를 파손 전부로 믿으면 안 되는 이유와, 로컬에서 남은 step을 마저 돌려 범위를 확정하는 방법.
tags: [rust, github-actions, cargo, akbun-makevideo]
timestamp: 2026-08-09T00:00:00Z
---

## 증상

akbun-makevideo의 verify job은 crate마다 `cargo test -p <crate>`를 따로 돌린다. 어떤 crate가 무엇을 필요로 하는지 step 이름으로 드러나고, ffmpeg나 소프트웨어 GPU 설치가 필요한 step을 뒤로 미룰 수 있어서 그렇게 나눠 두었다.

`Track`에 `subtitle_style` 필드를 추가한 뒤 이 job이 audio step에서 멈췄고, 로그에는 에러가 정확히 세 개 있었다.

```
error[E0063]: missing field `subtitle_style` in initializer of `Track`
   --> crates/audio/src/mix.rs:149:9
   --> crates/audio/src/source.rs:878:9
   --> crates/audio/src/source.rs:1409:29
```

세 곳을 채우고 다시 돌리면 다음 실패가 나온다. 같은 crate의 통합 테스트 하나, 그리고 그 뒤 step인 present crate에서 셋. 실제로 고쳐야 할 자리는 일곱 곳이었다.

## 원인

`run` step은 기본이 `bash -e`이고 job은 step이 실패하면 거기서 끝난다. 그래서 로그에 남는 에러는 파손 전부가 아니라 **가장 먼저 실행된 step의 몫**이다. cargo도 같은 성질을 한 번 더 겹친다. lib test 컴파일이 깨지면 같은 crate의 통합 테스트 타깃은 시작조차 하지 않는다.

`cargo test -p` 하나로 workspace 전체를 돌리는 구성이었다면 한 번에 다 보였겠지만, 그렇게 하면 ffmpeg도 GPU도 없는 상태에서 무엇이 정말 선택 사항인지 증명하는 성질을 잃는다. 이 job이 step을 나눈 이유가 곧 범위를 감추는 이유다.

## 판정하는 법

CI 로그의 에러 개수를 파손 전부로 믿지 않는다. 공유 struct나 enum에 필드·variant를 추가했으면, 고치기 전에 workflow의 test step을 순서대로 로컬에서 전부 돌려 범위를 먼저 확정한다.

```bash
for c in makevideo-time makevideo-edit makevideo-render makevideo-audio makevideo-compositor makevideo-present; do
  cargo test --manifest-path src-tauri/Cargo.toml -p $c --no-default-features
done
```

audio, compositor, present는 `--no-default-features`가 붙은 step과 안 붙은 step이 따로 있다. 필드 추가처럼 기능 선택과 무관한 파손이면 한쪽만으로 충분하지만, feature 뒤에 숨은 fixture를 놓치지 않으려면 둘 다 돌린다.

## 어디서 다시 만나는가

crate마다 step을 나눈 workflow 전부다. akbun-makevideo가 가장 심하지만(테스트 step이 아홉 개), 같은 방식으로 나눈 다른 product도 성질은 같다. "CI가 알려준 만큼만 고치고 push한다"를 반복하면 실패 → 수정 → 실패가 step 수만큼 이어진다.
