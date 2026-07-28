---
type: Decision
title: 웹 배포는 renderer를 그대로 두고 window.api만 브라우저 구현으로 갈아 끼운다
description: Electron 앱을 Cloudflare에 올리기 위해 main 프로세스를 포팅하지 않고 IPC 경계에서 갈아 끼웠다.
tags: [electron, cloudflare, web, shadowing-player]
timestamp: 2026-07-28T00:00:00Z
---

## 결정

shadowing.akbun.com에 올릴 웹 버전을 만들 때 renderer(renderer.ts, waveform.ts)와 static/은 한 줄도 고치지 않았다. 대신 src/web/api.ts에 브라우저용 `window.api`를 새로 구현하고, scripts/build-web.mjs가 renderer js와 static을 dist-web/에 모아 script 경로만 웹 기준으로 바꾼다.

브라우저 구현이 Electron main을 대신하는 방식이다.

- 파일 대화상자 → `input[type=file]`, 폴더는 `webkitdirectory`
- 목록 영속(library.json) → IndexedDB object store
- 파일 읽기(fs.readFile) → 목록에 파일 Blob을 함께 담아 두고 꺼내 읽기
- 상단 메뉴(설정) → 홈 화면에 설정 버튼을 주입
- 저장 위치 열기, 업데이트 확인 → 웹에서 할 일이 없어 버튼을 지우거나 no-op

## 이유

renderer가 Electron API를 직접 부르지 않고 preload가 노출한 `window.api` 하나만 보고 있었다. 이 경계가 이미 있었기 때문에 포팅 대상이 main 프로세스 전체가 아니라 인터페이스 하나로 줄었다. UI를 복제해 웹 전용 앱을 따로 두는 선택도 있었지만, 파형과 구간 반복 로직이 두 벌이 되어 고칠 때마다 갈라진다.

파일을 경로로 두지 않고 IndexedDB에 통째로 담은 것은, 브라우저가 다음 방문에 경로로 파일을 다시 열 수 없기 때문이다. File System Access API로 handle을 저장하는 방법도 있지만 Safari와 Firefox에서 쓸 수 없어, 브라우저를 가리지 않는 쪽을 택했다. 대신 브라우저 저장 용량을 쓰고 브라우저 데이터를 지우면 목록이 사라진다는 제약이 생겼고, 이는 [deploy.md](../../deploy.md)에 적어 두었다.

빌드 산출물을 만들 때 index.html을 새로 쓰지 않고 치환한 것도 같은 이유다. 화면 구조가 한 파일에만 있어야 데스크톱과 웹이 갈라지지 않는다. 치환 문자열을 못 찾으면 빌드를 세워, static/index.html이 바뀌면 조용히 깨진 페이지가 배포되는 대신 빌드가 실패하게 했다.
