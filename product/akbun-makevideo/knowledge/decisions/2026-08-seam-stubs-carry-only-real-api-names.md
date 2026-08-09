---
type: Decision
title: 경계 stub은 실제 API 이름만 가진다
description: 무엇을 물어도 답하는 test stub은 존재하지 않는 메서드 호출을 숨긴다.
tags: [makevideo, testing, preview]
timestamp: 2026-08-09T00:00:00Z
---

# 경계 stub은 실제 API 이름만 가진다

## 결정

* preview와 monitor 라우터 사이의 test stub은 실제 반환 객체의 이름만 담은 평범한 객체로 만든다
* 어떤 이름에도 함수를 돌려주는 Proxy stub 금지
* 라우터에만 있는 이름과 안쪽 preview에만 있는 이름이 겹치는 자리는 stub으로 구분한다

## 이유

* preview는 라우터가 감싸고 라우터는 같은 이름을 다시 노출하므로, 안쪽에 없는 메서드를 안쪽에 대고 불러도 코드가 읽히기에는 자연스러움
* Proxy stub은 그 호출을 통과시켜 미디어 엘리먼트 경로에서만 터지는 TypeError를 테스트 96개가 전부 통과한 채로 남김

## Citations

1. <https://github.com/choisungwook/portfolio/pull/797>
