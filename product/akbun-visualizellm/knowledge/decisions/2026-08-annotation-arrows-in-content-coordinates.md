---
type: Decision
title: 주석 화살표는 viewport가 아니라 content 좌표에 그린다
description: 스크롤되는 도형에 SVG 화살표를 붙일 때 overlay 대신 스크롤 콘텐츠 안에 SVG를 두기로 한 결정.
tags: [visualizellm, web, svg, layout]
timestamp: 2026-08-18T00:00:00Z
---

# 주석 화살표는 viewport가 아니라 content 좌표에 그린다

## 결정

* 라벨 열과 도형 열을 같은 grid에 넣고, 그 grid를 덮는 SVG를 스크롤되는 콘텐츠의 자식으로 둠
* 끝점은 `getBoundingClientRect`로 한 번 계산해 grid 기준 좌표로 저장하고, scroll event는 듣지 않음
* 다시 계산하는 시점은 콘텐츠가 실제로 움직일 때뿐: resize, 데이터 교체, 기능 on/off, 그리고 web font 로드 완료

## 이유

* fixed overlay 방식은 scroll handler가 hot path에 붙고, 관성 스크롤에서 프레임이 paint보다 늦어 화살표가 밀려 보임
* 화면 밖으로 나간 대상의 화살표를 잘라내는 clipping 처리가 추가로 필요함
* 콘텐츠 안에 두면 브라우저가 도형과 같은 레이어로 함께 옮기므로 위 세 가지가 모두 사라짐
* 대신 레이아웃이 조용히 바뀌면 화살표가 남음. web font가 first paint 뒤에 도착해 블록을 몇 px씩 밀어내는 경우가 실제로 그랬고, `document.fonts.ready`에서 재배치를 호출해 막음
