---
type: Decision
title: 모델 로드와 워크로드 실행 분리
description: 모델 가중치 적재와 요청 처리에 필요한 메모리를 같은 모델과 GPU를 사용하는 두 계산으로 구분한다.
tags: [llm-serving, vram, oom, user-interface]
timestamp: 2026-08-30T00:00:00Z
---

## 결정

- `Load Model`은 모델 가중치만 GPU VRAM과 비교한다.
- `Run a Workload`는 같은 모델과 GPU를 사용하고 KV 캐시와 추가 메모리를 더한다.
- 두 계산은 각각 독립된 병, 결과, 계산식을 사용한다.
- 결과는 `Needed`, `Available`, `Free` 또는 `Over`를 동일한 구조로 표시한다.

## 이유

- 모델 가중치가 GPU보다 크면 요청을 처리하기 전에 로드 단계에서 실패한다.
- 워크로드 OOM은 컨텍스트 길이, 동시 요청, KV 캐시, 런타임 메모리로 인해 별도로 발생한다.
- 두 실패 원인을 나누면 어떤 설정을 바꿔야 하는지 바로 이해할 수 있다.
- 모델과 GPU 입력을 공유하면 중복 설정 없이 두 결과를 직접 비교할 수 있다.
