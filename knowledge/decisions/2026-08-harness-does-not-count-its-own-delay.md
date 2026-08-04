---
type: Decision
title: 계측 하네스는 자기 지연과 재시작 지연을 대상의 실패로 세지 않는다
description: 재생 공급 하네스에서 sleep 오차와 seek 직후 재충전을 늦은 프레임에서 제외하고 각각 별도 지표로 분리한 결정.
tags: [measurement, playback, akbun-makevideo]
timestamp: 2026-08-04T00:00:00Z
---

## 결정

목표 fps로 프레임을 꺼내며 늦음을 판정하는 하네스에서 다음 두 가지를 늦은 프레임에서 뺀다.

- 하네스 자신이 슬롯을 넘겨 깨어난 시간. 판정 기준을 `준비 시각 > 마감 시각`이 아니라 `준비 시각 > max(마감 시각, 요청 시각)`으로 둔다.
- 재생 시작과 seek 직후 첫 프레임까지의 시간. 이 프레임에서 마감 시각 기준선을 다시 잡고, 지연은 startup delay 지표로만 남긴다.

대신 늦은 프레임 개수 옆에 늦은 정도의 p99를 함께 보고한다.

## 이유

- 두 보정 전에는 300 프레임 중 126개가 늦은 것으로 나왔고, 그중 대부분이 컨테이너의 sleep 오차와 seek 재충전이었다. 대상이 아니라 하네스를 읽고 있던 셈이다.
- seek는 큐를 비우고 다시 채우는 동작이라 첫 프레임이 늦는 것이 정상이다. 이것을 공급 실패로 세면 seek 시나리오는 구현과 무관하게 항상 실패하고, 합격 기준이 판정 기능을 잃는다.
- 같은 지연을 늦은 프레임과 startup delay 양쪽에 세면 한 번의 대기를 두 번 청구하게 된다.
- 개수만으로는 4 ms 늦은 7 프레임과 200 ms 늦은 7 프레임이 구분되지 않는다. 앞은 여유가 줄어든 상태고 뒤는 끊김이다.
- 판정 기준이 개선을 판정하지 못하면 이후 단계는 계측이 있는데도 체감으로 돌아간다. [재생 품질 계측 하네스](../../product/akbun-makevideo/quality/README.md)를 먼저 만든 이유가 이것이다.

## Citations

1. product/akbun-makevideo/adr/2026-08-prefetch-frame-source.md
2. product/akbun-makevideo/quality/README.md
