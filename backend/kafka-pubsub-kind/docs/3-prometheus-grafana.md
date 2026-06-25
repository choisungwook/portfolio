# Prometheus와 Grafana로 무엇을 확인할까

Kafka pub/sub가 동작한다고 해도 운영에서는 "메시지가 잘 갔다"만으로 충분하지 않습니다. 애플리케이션이 살아 있는지, HTTP 요청이 들어오는지, JVM이 어떤 상태인지도 같이 봐야 합니다. 이 핸즈온에서는 Prometheus와 Grafana로 무엇을 확인할까요?

## 왜 Kafka broker metric 대신 애플리케이션 metric부터 볼까요?

Kafka broker metric을 보려면 JMX exporter나 broker metric 설정이 추가로 필요합니다. 장점은 broker 내부 상태를 볼 수 있다는 점입니다. 단점은 첫 실습에서 Kafka, JMX, Prometheus 설정을 동시에 이해해야 해서 pub/sub 흐름이 흐려질 수 있다는 점입니다.

이 예제는 Spring Boot Actuator의 `/actuator/prometheus`를 먼저 수집합니다. 애플리케이션 관점에서 요청 수, 응답 시간, JVM 상태를 확인하고, broker metric은 다음 단계로 남깁니다. **처음에는 producer/consumer 앱이 정상인지 보는 것이 Kafka 자체를 깊게 보는 것보다 학습 비용이 낮습니다.**

## Prometheus target은 어떻게 확인할까요?

Prometheus를 로컬로 연결합니다.

```sh
make port-forward-prometheus
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:9090/targets
```

`kafka-pubsub-app` target이 `UP`이면 Prometheus가 Spring Boot metric을 수집하고 있습니다. `DOWN`이면 먼저 Pod 상태와 Service 이름을 확인합니다.

```sh
kubectl -n kafka get pods
kubectl -n kafka get svc kafka-pubsub-app
```

## 어떤 PromQL을 먼저 보면 좋을까요?

HTTP 요청이 들어오는지 보려면 다음 query를 사용합니다.

```promql
http_server_requests_seconds_count
```

JVM memory 사용량은 다음 query로 확인합니다.

```promql
jvm_memory_used_bytes
```

consumer lag 같은 Kafka 중심 metric은 이 예제에 포함하지 않았습니다. 확인 필요: broker JMX exporter를 추가하면 `kafka.consumer` 또는 broker 관련 metric까지 확장할 수 있습니다.

## Grafana는 어떻게 열까요?

Grafana를 로컬로 연결합니다.

```sh
make port-forward-grafana
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:3000
```

이 예제는 실습 편의를 위해 anonymous access를 켰습니다. 장점은 비밀번호를 문서와 manifest에 넣지 않아도 된다는 점입니다. 단점은 운영 환경에는 절대 맞지 않는 설정이라는 점입니다. 운영에서는 인증과 권한을 반드시 따로 구성해야 합니다.

Grafana Explore에서 datasource로 `Prometheus`를 선택하고, Prometheus에서 사용한 query를 그대로 실행합니다.

## 장애를 일부러 만들면 무엇을 볼 수 있을까요?

애플리케이션 Pod를 재시작하면 readiness와 HTTP metric 변화를 볼 수 있습니다.

```sh
kubectl -n kafka rollout restart deployment/kafka-pubsub-app
```

재시작 후 다시 메시지를 보내고 `http_server_requests_seconds_count`가 증가하는지 확인합니다. 이 과정에서 Kafka topic의 기존 메시지가 다시 보일 수 있습니다. consumer group offset과 topic retention 정책에 따라 보이는 결과가 달라질 수 있습니다.

정리하면, 이 핸즈온에서 Prometheus와 Grafana를 붙인 이유는 Kafka 자체를 모두 관측하려는 것이 아니라 pub/sub 애플리케이션이 요청을 받고 metric을 내보내는 첫 경로를 보기 위해서입니다. broker metric까지 보려면 JMX exporter를 추가하는 다음 실습이 필요합니다.

## 참고자료

- Prometheus Documentation: <https://prometheus.io/docs/introduction/overview/>
- Grafana Documentation: <https://grafana.com/docs/grafana/latest/>
- Micrometer Prometheus Registry: <https://micrometer.io/docs/registry/prometheus>
