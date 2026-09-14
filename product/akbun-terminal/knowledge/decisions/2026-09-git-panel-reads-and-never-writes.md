---
type: Decision
title: Git 패널은 읽기만 하고 저장소를 바꾸지 않는다
description: commit 상세와 staged/unstaged/stash 패널을 추가하면서 stage, unstage, stash apply 같은 쓰기 동작은 넣지 않기로 한 결정.
tags: [git, macos, ui, akbun-terminal]
timestamp: 2026-09-13T00:00:00Z
---

## 결정

- 오른쪽 Git 패널은 `git_show`와 `git_working`으로 읽기만 한다. stage, unstage, discard, stash apply를 넣지 않는다.
- commit patch는 core에서 파일 단위로 잘라 넘긴다. shell은 diff를 파싱하지 않는다.
- 파일별 추가/삭제 줄 수는 그 조각을 세어 만든다. `--numstat`을 따로 호출하지 않는다.

## 이유

- 이 창의 가운데는 shell이다. 패널에서 stage하면 같은 저장소를 바꾸는 경로가 둘이 되고, 3초 주기로 읽는 패널과 사용자가 방금 친 명령이 서로 다른 상태를 보여주는 구간이 생긴다.
- 쓰기가 없으면 실패 경로도 없다. 읽기는 "저장소가 아니다"와 "답이 비었다"가 같은 처리로 끝나므로 패널이 오류창을 띄울 일이 없다.
- diff 파싱이 shell에 있으면 창 없이 테스트할 수 없다. 자르기는 Rust에, 줄 분류와 줄번호는 `GitDiff`(core 패키지)에 두어 둘 다 테스트가 본다.
- 카운트를 별도 호출로 얻으면 두 번의 git 호출 사이에 저장소가 바뀌었을 때 행의 숫자와 그 아래 줄이 어긋난다. 같은 조각에서 세면 어긋날 수 없다.

## Citations

1. `core/crates/core/src/git.rs`의 `show`, `working`, `split_patch`
2. `Sources/AkbunTerminalCore/GitDiff.swift`
