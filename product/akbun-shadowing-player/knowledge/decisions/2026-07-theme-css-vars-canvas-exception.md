---
type: Decision
title: 테마는 CSS 변수와 light-dark()로 두되 canvas 색만 예외로 둔다
description: 색을 :root 변수 한 곳에 모으고 light-dark()로 두 테마를 함께 쓰지만, JS가 읽어 가는 --wave-* 변수만 선택자로 값을 나눈다.
tags: [css, theme, canvas, akbun-shadowing-player]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

색은 style.css의 :root 변수 한 곳에 모으고 라이트와 다크 값을 light-dark()로 함께 쓴다. 어느 쪽을 쓸지는 color-scheme이 정하므로, 테마 전환은 html 요소의 data-theme 속성 하나로 끝난다. 속성이 없으면 color-scheme이 light dark라서 시스템 설정을 따라간다.

예외는 canvas에 쓰는 --wave-* 변수다. 이 값들만 :root, prefers-color-scheme 미디어 쿼리, [data-theme] 세 선택자로 나눠 쓰고, 테마가 바뀌면 renderer.ts가 waveform.refreshColors()를 불러 캐시한 색을 다시 읽는다.

## 이유

- canvas는 CSS를 적용받지 않아 waveform.ts가 getComputedStyle로 색을 읽어 가야 한다. 그런데 @property로 등록하지 않은 custom property는 계산값이 토큰 그대로라서, light-dark(#1173b8, #4cc2ff) 문자열이 그대로 나온다. ctx.fillStyle에 넣으면 무시되어 파형이 그려지지 않는다.
- @property로 --wave-* 를 <color>로 등록하면 해석되지만, 변수마다 등록 블록이 필요하고 해석 규칙이 브라우저 구현에 더 얽힌다. 선택자를 하나 더 쓰는 쪽이 확인하기 쉽다.
- 나머지 색은 CSS 안에서만 쓰이므로 light-dark()가 정상 동작한다. 예외를 canvas 색으로 한정하면 중복되는 값이 6개뿐이다.
- 다크 모드를 기본으로 두고 라이트를 덧칠하는 방식은 색이 두 곳에 흩어진다. 변수 한 곳에서 두 값을 나란히 보는 편이 대비를 맞추기 쉽다.
