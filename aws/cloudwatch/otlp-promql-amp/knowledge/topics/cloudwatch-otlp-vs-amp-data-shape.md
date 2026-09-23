---
type: Topic
title: 같은 Prometheus metric이 CloudWatch OTLP와 AMP에서 다른 모양으로 저장된다
description: counter와 rate는 같지만 replica label, histogram, 시작 시각, selector 제약이 달라 쿼리를 옮길 때 고쳐야 한다.
tags: [cloudwatch, otlp, promql, amp, opentelemetry]
timestamp: 2026-09-23T00:00:00Z
---

# 같은 Prometheus metric이 CloudWatch OTLP와 AMP에서 다른 모양으로 저장된다

측정 환경: otel collector-contrib 0.161.0, prometheus receiver, ap-northeast-2, 2026-09.

- replica label: AMP는 `instance`, CloudWatch는 `@resource.service.instance.id`. `@`·`.`이 든 label은 `sum by ("...")`처럼 따옴표로 감싼다
- histogram: CloudWatch는 native histogram 한 series로 저장해 `_bucket`, `_count`가 없다. p95는 `histogram_quantile(0.95, sum by (model) (rate(x[5m])))`로 `le` 없이 쓴다
- p95 추정값이 다르다. 지수분포 demo에서 AMP는 실제보다 약간 높고 CloudWatch는 최대 약 13% 낮았다. CloudWatch 보간 방식은 확인하지 못했다
- CloudWatch는 `StartTimeUnixNano`가 없는 cumulative datapoint를 partial success로 버린다. `_created`가 없는 counter(`process_*`, `python_gc_*`)가 대상이다. `metric_start_time` processor(`true_reset_point`)로 채운다
- CloudWatch는 요청당 datapoint 1,000개 한도라 `batch.send_batch_max_size: 1000`이 필요하다
- CloudWatch는 이름 없는 selector(`{__name__=~"..."}`)를 거절한다
- Grafana `grafana-amazonprometheus-datasource`로 CloudWatch를 붙일 때 `jsonData.sigv4Service: monitoring`이 없으면 `aps`로 서명해 거절된다

실측과 쿼리는 [docs/5-compare.md](../../docs/5-compare.md)에 있다.
