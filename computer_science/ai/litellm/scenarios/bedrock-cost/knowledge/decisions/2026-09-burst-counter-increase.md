---
type: Decision
title: 버스트 트래픽 counter는 increase 대신 offset 차분으로 센다
description: 요청이 몇 초 안에 몰리는 실험에서 increase()의 추정이 실제 건수와 어긋난다.
tags: [prometheus, grafana, litellm]
timestamp: 2026-09-20T00:00:00Z
---

# 버스트 트래픽 counter는 increase 대신 offset 차분으로 센다

## 결정

Grafana 대시보드에서 LiteLLM counter의 구간 증가분을 뽑을 때 `increase()`를 쓰지 않는다. 지금 값에서 한 구간 전 값을 뺀다.

```promql
clamp_min(sum(litellm_proxy_total_requests_metric_total) - sum(litellm_proxy_total_requests_metric_total offset $__interval), 0)
```

패널의 min interval은 1분으로 둔다. scrape 간격이 15초라 한 구간에 sample 네 개가 들어간다.

## 이유

`increase()`와 `rate()`는 구간 양 끝 sample로 구간 전체를 추정한다. 이 실습은 요청이 몇 초 안에 몰렸다 끊기는 형태라 추정이 어긋난다. 실측에서 2시간 동안 실제 요청 2건이 `increase(...[1m])` 합계로 1.33으로 나왔고, 20분 구간에서는 53,156이어야 할 값이 44,058로 나왔다. 차분은 두 구간에 1씩, 합계 2로 정확히 나왔다.

`clamp_min`은 proxy 재시작으로 counter가 0으로 돌아간 자리에서 음수가 찍히는 것을 막는다.

캐시 token 패널만 구간 막대와 누적 선 두 종류를 둔다. 구간 막대는 "그때 몇 개"를 답하지만 "지금 캐시에 얼마가 살아 있는가"는 누적 선으로만 보인다. Bedrock prompt cache의 TTL은 5분이고 읽을 때마다 리셋되므로, 누적 선이 한 번 계단처럼 오른 뒤 평평하면 그 prefix가 살아 있다는 뜻이다.
