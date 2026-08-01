---
type: Decision
title: Tauri 앱의 썸네일은 webview가 그리고 Rust는 바이트만 저장한다
description: akbun-folderview의 썸네일 캐시를 Rust 이미지 라이브러리 없이 canvas로 생성하기로 한 결정.
tags: [tauri, desktop, performance]
timestamp: 2026-08-01T00:00:00Z
---

## 결정

akbun-folderview의 썸네일 캐시는 webview가 만든다. 카드의 img가 onerror를 내면 페이지가 원본을 asset protocol로 한 번 읽어 canvas로 축소하고, JPEG 바이트를 save_thumb 명령으로 넘긴다. Rust는 이름을 검증하고 파일로 쓸 뿐 이미지 라이브러리를 갖지 않는다. 파일명은 경로+mtime+size의 FNV-1a 해시라서 파일이 바뀌면 새 썸네일이 되고, 갱신을 추적할 상태가 없다.

## 이유

- Rust에서 image crate로 디코딩하면 heic와 동영상은 어차피 못 다룬다. webview의 Chromium 코덱을 쓰면 화면에 표시되는 포맷과 썸네일이 되는 포맷이 정확히 일치한다. 동영상 포스터 프레임도 video 엘리먼트 seek로 같은 경로로 얻는다.
- image crate는 빌드 시간과 CI 캐시를 키운다. tauri 앱 crate는 이미 무겁고, 순수 모델 crate 분리로 얻은 CI 이점을 지키고 싶었다.
- 생성이 페이지에 있으면 loading="lazy"의 onerror가 자연스러운 생성 큐 창이 된다. 뷰포트 근처 카드만 생성을 요청하므로 우선순위 로직이 공짜다.
- 느린 디스크 보호(동시 2개, 30초 타임아웃)도 페이지의 큐 하나로 끝난다. Rust 쪽 스레드 풀 관리가 필요 없다.

같은 상황의 다른 Tauri product에도 이 구성을 기본으로 한다. 단, blob URL로 갓 만든 썸네일을 보여주므로 CSP img-src에 blob:이 필요하고, 생성용 video 엘리먼트 때문에 media-src도 유지해야 한다.

## 지뢰: canvas에 그릴 asset은 crossOrigin이 필수다

첫 출시 버전은 썸네일이 하나도 만들어지지 않았다. asset protocol(Windows에서는 asset.localhost 호스트)은 페이지(tauri.localhost)와 다른 origin이라, crossOrigin 없이 로드한 img/video를 canvas에 그리면 canvas가 taint되어 toBlob이 실패한다. 에러는 카드마다 "no preview"로만 보이고 콘솔의 SecurityError는 릴리스 빌드에서 아무도 보지 않는다. Tauri v2의 asset protocol은 Access-Control-Allow-Origin을 window origin으로 응답하므로, 생성용 img/video 엘리먼트에 crossOrigin = 'anonymous'를 주면 끝난다. 표시만 하는 엘리먼트에는 필요 없다.

관련: [서명 없는 데스크톱 앱의 자동 업데이트는 dmg를 받아 번들을 교체한다](2026-07-unsigned-desktop-app-self-update.md)
