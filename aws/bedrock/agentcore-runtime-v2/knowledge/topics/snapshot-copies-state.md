---
type: Topic
title: V2 snapshot은 random 모듈 상태까지 복제하고, V1에도 warm pool이 있다
description: 시나리오 2, 3의 측정에서 얻은, 문서만 읽어서는 드러나지 않는 동작 두 가지
tags: [bedrock, agentcore, snapshot]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-13T09:40:00Z }
---

## V2: handler 안의 random.random()도 session끼리 같다

복원된 V2 session 세 개에서 handler가 처음 호출한 `random.random()`이 모두 `0.22408205029316564`였다. `uuid.uuid4()`는 `os.urandom`을 읽어 달랐다. 문서의 "random 모듈은 시작 시 시드된다"는 문장은 초기화 때 뽑은 값만의 문제로 읽히기 쉬운데, 실제로는 handler에서 뽑는 값도 겹친다.

## V1: 초기화를 마치고 멈춘 microVM pool이 있다

V1 새 session의 `wall_since_init`은 228초, `monotonic_since_init`은 4초였다(초기화 20초). 초기화 후 멈췄다가 재개된 microVM이다. 순차 10개, 동시 20개까지는 0.4~4초였고 그 뒤는 23~28초였다. pool 크기는 문서에 없고 직전 호출 이력에 따라 달라지므로, V1 부하 테스트는 같은 명령도 결과가 크게 갈린다.

관련: [platform_version 명시 결정](../decisions/2026-11-explicit-platform-version.md)
