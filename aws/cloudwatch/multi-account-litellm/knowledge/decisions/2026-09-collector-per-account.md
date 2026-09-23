---
type: Decision
title: LiteLLM 수집기는 replica sidecar가 아니라 계정당 task 1개로 둔다
description: sidecar는 모든 replica를 localhost로 긁어 instance label이 같아지므로, 계정당 수집기 1개가 Cloud Map A 레코드로 replica를 하나씩 찾는다.
tags: [litellm, ecs, opentelemetry, prometheus]
timestamp: 2026-09-23T00:00:00Z
---

# LiteLLM 수집기는 replica sidecar가 아니라 계정당 task 1개로 둔다

## 결정

- 계정마다 ADOT collector task 1개를 띄운다. LiteLLM service는 Cloud Map private DNS에 A 레코드로 등록하고, 수집기는 `dns_sd_configs`로 replica를 하나씩 긁는다
- 로컬 compose도 같은 구조다. vmagent가 compose 서비스 이름의 A 레코드로 replica를 찾는다
- 수집기 하나가 EMF(CloudWatch)와 remote write(VictoriaMetrics, AMP)를 파이프라인만 나눠 동시에 보낸다

## 이유

- sidecar는 `localhost:4000`을 긁는다. `instance` label이 모든 replica에서 같아 중앙 저장소에서 replica들의 counter가 한 series로 섞인다. 이를 피하려면 ECS metadata로 task ID를 label에 붙이는 설정이 추가로 필요하다
- sidecar는 replica 수만큼 CPU·메모리를 더 쓴다. 계정당 1개면 방안과 무관하게 수집기 비용이 task 2개(월 16.6 USD)로 고정된다
- CloudWatch managed Prometheus collector(2026년 7월)도 ECS를 Cloud Map DNS로 찾는다. 같은 구조라 나중에 관리형으로 바꿀 때 LiteLLM 쪽을 고치지 않는다

## 주의

- DNS TTL(10초) 동안 교체된 task를 못 찾거나 사라진 task를 긁어 `up=0`이 잠깐 생긴다
- 수집기가 내려가면 그 계정의 LiteLLM metric 전체가 끊긴다. 수집기 자체의 `up`은 중앙에서 알 수 없으므로 "살아 있는 replica 수" 패널이 0이 되는 것으로 알아챈다

## Citations

1. [terraform/modules/litellm-ecs/collector.yaml.tftpl](../../terraform/modules/litellm-ecs/collector.yaml.tftpl)
2. [local/vmagent/scrape-prod.yml](../../local/vmagent/scrape-prod.yml)
