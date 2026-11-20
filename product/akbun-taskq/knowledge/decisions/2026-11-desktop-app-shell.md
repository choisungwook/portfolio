---
type: Decision
title: The macOS desktop app is a Tauri window around the released executable
description: The app starts the bundled taskq through the login shell and shows its page; it has no updater of its own.
tags: [desktop, tauri, release]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-20T00:00:00Z }
---

## 결정

- 데스크톱 앱(`workspace/desktop/`)은 release가 이미 만드는 `taskq` 실행 파일을 Tauri의 `externalBin`으로 싣고, 그 프로세스가 출력한 주소를 창에 띄운다. taskq의 코드는 바꾸지 않는다.
- taskq는 사용자의 로그인 셸(`$SHELL -ilc`)을 거쳐 시작한다.
- Tauri updater plugin을 넣지 않는다. 설정 > 업데이트(`src/update.ts`)가 `process.execPath`, 곧 앱 번들 안의 실행 파일을 바꾼다.
- dmg는 `release-akbun-taskq.yml`의 macOS job이 같은 tag에 올린다. 별도 workflow와 tag를 만들지 않는다.

## 이유

- 화면과 서버가 이미 한 프로세스에 있고 실행 파일 하나로 배포된다. 앱 안에서 서버를 다시 구현하면 같은 것을 두 벌 유지하게 된다. 껍데기는 Rust 100줄 남짓이고 번들에 더하는 크기는 10 MB 안팎이다.
- Electron은 버렸다. 껍데기를 TypeScript로 쓸 수 있지만 taskq는 Node 24의 type stripping과 `node:sqlite`에 기대므로 Electron 안에서 돌릴 수 없어 어차피 실행 파일을 따로 띄운다. 얻는 것 없이 Chromium만 더해진다.
- Finder에서 연 앱은 PATH가 `/usr/bin:/bin` 수준이다. 그대로 띄우면 bot이 `aws`, `git`, `codex`, `kiro-cli`를 찾지 못한다. 로그인 셸을 거치면 터미널에서 `taskq run`을 한 것과 같은 환경이 된다. zsh와 bash만 쓰고 그 밖의 셸은 zsh로 대신한다.
- updater를 따로 두면 서명 키를 하나 더 관리해야 하고, 470 MB 번들을 받는 경로가 둘이 된다. 껍데기는 거의 바뀌지 않으므로 실행 파일만 바뀌면 화면과 서버가 모두 새 버전이다. 대가로 껍데기 자체의 수정은 dmg를 다시 받아야 전달되고, 앱의 표시 버전은 설치한 때의 값으로 남는다.
- 주소 줄은 `http://127.0.0.1:`로 시작할 때만 따른다. 출력이 셸 프로필을 거쳐 오므로 프로필이 찍은 글이 창을 다른 곳으로 보내지 못하게 한다.
- webview는 브라우저가 아니다. `confirm`과 `prompt`는 아무것도 보이지 않고 false와 null을 돌려주며, 새 창 링크와 내려받기는 앱이 처리기를 달지 않으면 버려진다. 그래서 UI는 `ui/js/core/ask.js`의 dialog로 묻고(native 호출이 생기면 `test/ui-forms.test.ts`가 실패), 껍데기는 새 창 링크를 기본 브라우저로 넘기고 내려받기를 `~/Downloads`에 저장한다. 껍데기에는 updater가 없으므로 이런 처리는 첫 release에 넣었다.
- 확인한 것은 데모 서버를 실행 파일 자리에 둔 로컬 빌드다. 창에 화면이 뜨는 것, 종료 시 프로세스 정리, 시작 실패 표시, dialog까지 봤다. 새 창 링크와 내려받기 처리기, bun 실행 파일을 실은 번들, 번들 안에서의 업데이트는 release 뒤에 설치본으로 확인해야 한다.
