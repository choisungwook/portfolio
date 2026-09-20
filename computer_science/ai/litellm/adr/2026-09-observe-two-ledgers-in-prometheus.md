---
type: Decision
title: 두 장부를 Prometheus 한 곳에서 질의한다
description: LiteLLM은 자기 /metrics를 열고 Bedrock은 cloudwatch-exporter로 옮겨, 슬라이드의 주장을 PromQL 뺄셈 하나로 확인한다
tags: [litellm, bedrock, prometheus, observability]
timestamp: 2026-09-20T00:00:00Z
---

## 결정

- LiteLLM 쪽은 exporter 컨테이너를 따로 두지 않는다. `config.yaml`에 `callbacks: ["prometheus"]`를 주면 proxy가 자기 `/metrics`를 연다.
- Bedrock 쪽은 `prom/cloudwatch-exporter`로 AWS/Bedrock 지표 5종을 옮긴다.
- 로컬 lab에서는 `require_auth_for_metrics_endpoint: false`로 `/metrics`를 열어 Prometheus가 토큰 없이 긁게 한다.
- Grafana를 둔다. LiteLLM 저장소의 공식 대시보드(dashboard_v2) 사본과 이 실습이 만든 대시보드 3종을 프로비저닝한다.
- 시나리오는 Prometheus 라벨이 아니라 시간으로 가른다.
- CloudWatch 대상만 scrape 주기를 5분으로 묶는다.

## 이유

- LiteLLM v1.99.1 OSS에 `litellm_provider_cache_read_input_tokens_metric`과 `litellm_provider_cache_creation_input_tokens_metric`이 있다. 이 둘이 있어야 `input_tokens`에서 캐시 token을 빼는 질의가 성립한다. enterprise 라이선스는 필요 없다.
- 두 장부가 한 Prometheus 안에 있어야 `LiteLLM input − 캐시 읽기 − 캐시 쓰기`와 `Bedrock input`을 나란히 눌러 볼 수 있다. 이 뺄셈 하나가 131배 차이의 설명을 닫는다.
- CloudWatch `GetMetricStatistics`는 1,000회당 $0.01이다. 15초 주기면 하루 $0.29, 5분 주기면 $0.015다. 실습 예산이 $5라서 주기를 묶었다.
- 질의 여섯 개를 손으로 던지는 것보다 화면이 낫다는 판단으로 Grafana를 넣었다. 공식 대시보드가 저장소에 있어 새로 그릴 필요가 없고, 외부 링크에 의존하지 않도록 사본을 둔다.
- 시나리오 라벨은 붙일 수 없다. 요청 metadata의 임의 키를 LiteLLM이 버리고, `custom_prometheus_metadata_labels`와 `custom_prometheus_tags` 모두 라벨을 만들지 못했다. 지표의 라벨 목록이 PrometheusLogger 생성 시점에 굳기 때문으로 보인다. 그래서 `run-all.sh`가 시각을 찍고 Grafana에서 시간으로 가른다.

## 주의

- LiteLLM 지표는 proxy 기동 이후 누적되는 counter이고, `aws_bedrock_*_sum`은 최근 10분 구간의 합이다. 시간 축이 달라서 그냥 빼면 안 된다. 실험 직전에 proxy를 다시 띄우고 10분 안에 읽는다.
- `increase()`로 counter 증가분을 뽑으면 요청이 몇 초에 몰리는 이 실험에서는 과대 추정된다. 53,156이어야 할 값이 20분 구간에서 44,058로 나왔다.

## Citations

1. litellm v1.99.1 `litellm/integrations/prometheus.py`
2. [scenarios/bedrock-cost/docs/6-observe.md](../scenarios/bedrock-cost/docs/6-observe.md)
3. litellm `cookbook/litellm_proxy_server/grafana_dashboard/dashboard_v2` (공식 대시보드 원본)
4. AWS 문서 "How tokens are counted in Amazon Bedrock" — InputTokenCount는 캐시 token을 제외하고, 쿼터 기준 입력은 InputTokenCount + CacheWriteInputTokenCount
