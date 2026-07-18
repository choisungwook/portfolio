---
type: Decision
title: retained size는 클래스 제거 근사로 계산
description: dominator tree 대신 클래스 인스턴스를 제거했을 때 GC root 도달 가능 바이트가 줄어드는 양으로 retained size를 근사한다.
tags: [jvm, algorithm]
timestamp: 2026-07-18T00:00:00Z
---

## 결정

클래스별 retained size를 정확한 dominator tree(Lengauer-Tarjan)로 계산하지 않는다. 대신 "기준 도달 가능 바이트 - 그 클래스 인스턴스를 전부 없는 셈 치고 다시 센 도달 가능 바이트"로 근사한다. 비용을 제한하기 위해 히스토그램 상위 20개 클래스만 계산한다(그래프 탐색 21회).

## 이유

- 도구의 목적은 OOM 원인 클래스를 좁히는 것이다. 순위와 자릿수만 맞으면 되고, 바이트 단위 정확도는 필요 없다.
- dominator tree는 구현 난이도와 코드량이 이 프로젝트의 "기능 4개 미니 도구" 범위를 넘는다. 근사 방식은 도달 가능성 탐색 함수 하나를 재사용해 끝난다.
- 이 근사는 클래스 단위 관점이라 개별 객체의 retained와 다르고, 공유 참조가 많으면 클래스별 값의 합이 힙 전체보다 클 수 있다. 각 값은 "이 클래스를 통째로 치우면 얼마가 풀리는가"라는 독립적인 질문의 답으로 읽어야 한다.

## Citations

1. Eclipse MAT의 shallow/retained size 정의를 기준 개념으로 삼았다 (MAT 문서 "Shallow vs. Retained Heap").
