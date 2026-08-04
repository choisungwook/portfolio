---
type: Decision
title: 브라우저에서 SVG를 PNG로 내보내려면 다이어그램을 더 단순하게 그린다
description: canvas는 SVG-as-image의 foreignObject를 빈칸으로 그리고 래스터화 중에는 웹폰트를 받지 않으므로, 내보내기가 있는 도구는 미리보기 품질을 먼저 포기한다.
tags: [frontend, canvas, svg, mermaid]
timestamp: 2026-08-04T00:00:00Z
---

## 결정

브라우저에서 SVG를 PNG로 내보내는 기능이 있으면, 렌더러 설정을 내보내기 쪽에 맞춘다. HTML 라벨(foreignObject)을 끄고, 폰트는 기계에 이미 있는 시스템 스택으로 지정한다. akbun-rendermermaid는 mermaid의 htmlLabels를 false로 두고 fontFamily에 웹폰트를 넣지 않는다.

직렬화한 markup은 img로 로드해 canvas에 그리는데, 그 전에 두 가지를 손본다. width/height를 픽셀로 못 박고 style의 max-width를 지운다. 배율은 2배를 기본으로 하되 긴 변이 8192px를 넘으면 낮춘다.

## 이유

- foreignObject는 canvas에 그려지지 않는다. mermaid 기본값으로 내보내면 박스와 화살표는 있는데 글자가 하나도 없는 PNG가 나온다. 실패가 아니라 조용히 빈칸이라 테스트가 아니라 눈으로만 잡힌다.
- 래스터화 중에는 웹폰트를 받아오지 않는다. 화면은 Outfit인데 저장물만 fallback 폰트가 되어 둘이 어긋난다.
- SVG의 max-width는 래스터화 크기를 clamp한다. 배율을 2로 줘도 원래 크기대로 나온다.
- canvas 할당은 몇 천 px에서 실패하고 한계는 브라우저와 기기마다 다르다. 8192px은 아직 현역인 가장 낮은 값이라, 넘으면 에러 대신 배율을 낮추는 쪽이 저장 버튼의 기대에 맞는다.

즉 미리보기가 mermaid가 그릴 수 있는 것보다 조금 밋밋해진다. 저장물이 결과물인 도구에서는 맞는 방향이지만, htmlLabels를 다시 켜면 미리보기가 좋아지고 내보내기가 깨지는데 아무것도 시끄럽게 실패하지 않는다는 점이 이 결정의 진짜 비용이다.

canvas는 SVG를 그릴 때 이렇게 조용히 실패하는 지점이 여럿이다. 다른 하나는 [Tauri 앱의 썸네일은 webview가 그리고 Rust는 바이트만 저장한다](2026-08-thumbnails-in-the-webview.md)의 crossOrigin taint다.
