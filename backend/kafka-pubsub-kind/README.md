# Kafka pub/sub 로컬 Kubernetes 핸즈온

Kafka를 왜 쓰는지 말로만 이해하지 않고, kind cluster에서 메시지를 발행하고 소비하는 흐름을 직접 확인하기 위한 핸즈온입니다.

## 문서

1. [kind에서 Kafka를 먼저 띄우는 이유](./docs/1-kind-kafka.md)
2. [Spring Boot producer/consumer는 어떻게 메시지를 주고받을까](./docs/2-spring-producer-consumer.md)
3. [Prometheus와 Grafana로 무엇을 확인할까](./docs/3-prometheus-grafana.md)

## 구성

- `src/`: Spring Boot producer/consumer 예제
- `kind/`: kind cluster 설정
- `manifests/`: Kafka, 애플리케이션, Prometheus, Grafana manifest
- `Makefile`: 로컬 실습 명령
