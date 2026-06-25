# Spring Boot producer/consumer는 어떻게 메시지를 주고받을까

Kafka는 producer가 topic에 record를 쓰고 consumer가 topic을 읽는 구조입니다. 그런데 처음 실습할 때는 producer와 consumer를 따로 설명하면 흐름이 끊겨 보이기 쉽습니다. 같은 Spring Boot 앱 안에서 메시지를 보내고 다시 읽게 만들면 무엇이 더 잘 보일까요?

## 왜 producer와 consumer를 한 앱에 같이 둘까요?

producer와 consumer를 한 앱에 같이 두면 메시지 발행 요청부터 consumer listener 동작까지 한 번에 확인할 수 있습니다. 장점은 실습자가 API 하나로 전체 흐름을 검증할 수 있다는 점입니다. 단점은 실제 서비스처럼 producer 서비스와 consumer 서비스를 분리한 구조는 아니라는 점입니다.

이 예제의 목적은 Kafka를 처음 접하는 엔지니어가 pub/sub 흐름을 빠르게 확인하는 것입니다. 그래서 구조를 나누기보다 producer class와 consumer class를 분리하고, 애플리케이션 배포는 하나로 유지했습니다.

## 메시지는 어떻게 발행할까요?

애플리케이션은 `POST /messages` API를 제공합니다. 먼저 애플리케이션 Service를 로컬로 연결합니다.

```sh
make port-forward-app
```

다른 터미널에서 메시지를 발행합니다.

```sh
curl -X POST http://localhost:8080/messages \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello kafka from kind"}'
```

응답에는 Kafka가 기록한 topic, partition, offset이 들어옵니다.

```json
{
  "value": "hello kafka from kind",
  "topic": "study-events",
  "partition": 0,
  "offset": 0
}
```

## consumer는 언제 메시지를 읽을까요?

Spring Kafka의 `@KafkaListener`는 topic을 구독하고 record가 들어오면 listener method를 실행합니다. 이 예제는 최근에 소비한 메시지 20개만 메모리에 보관합니다. 그래서 발행 후 다음 API로 consumer가 읽은 메시지를 확인할 수 있습니다.

```sh
curl http://localhost:8080/messages
```

응답 예시는 다음과 같습니다.

```json
[
  {
    "value": "hello kafka from kind",
    "topic": "study-events",
    "partition": 0,
    "offset": 0,
    "consumedAt": "2026-06-25T00:00:00Z"
  }
]
```

`consumedAt`은 예시 값입니다. 실제 값은 실행한 시간으로 달라집니다.

## Kafka consumer group은 왜 중요할까요?

consumer group은 같은 topic을 읽는 consumer들을 하나의 소비 단위로 묶습니다. 같은 group 안에서는 partition이 consumer들에게 나뉘어 배정됩니다. 이 예제는 단일 Pod와 단일 topic으로 시작하기 때문에 group 동작이 크게 드러나지 않습니다.

Pod replica를 늘리면 group 개념이 더 중요해집니다. 장점은 메시지 처리량을 늘릴 수 있다는 점입니다. 단점은 partition 수보다 consumer 수가 많으면 놀고 있는 consumer가 생길 수 있다는 점입니다. 그래서 Kafka를 설계할 때는 topic partition 수와 consumer replica 수를 함께 봐야 합니다.

## 애플리케이션 설정은 어디에서 바꿀까요?

Kubernetes에서는 `manifests/20-app.yaml`의 ConfigMap이 Spring Boot 환경 변수를 주입합니다.

```yaml
data:
  KAFKA_BOOTSTRAP_SERVERS: kafka:9092
  KAFKA_TOPIC: study-events
  KAFKA_CONSUMER_GROUP: kafka-pubsub-kind
```

로컬에서 직접 Spring Boot를 실행하려면 `KAFKA_BOOTSTRAP_SERVERS`를 접근 가능한 Kafka 주소로 바꿔야 합니다. 이 저장소는 kind 실습을 기준으로 구성했기 때문에 로컬 JVM 직접 실행은 별도 검증이 필요합니다. 확인 필요.

정리하면, producer와 consumer를 한 앱에 둔 이유는 Kafka record가 topic에 쓰이고 다시 소비되는 흐름을 짧게 보기 위해서입니다. 실제 서비스 설계에서는 producer와 consumer를 분리할 수 있지만, 첫 학습에서는 offset과 consumer group을 눈으로 확인하는 것이 더 중요합니다.

## 참고자료

- Spring for Apache Kafka Reference: <https://docs.spring.io/spring-kafka/reference/>
- Spring Boot Actuator Reference: <https://docs.spring.io/spring-boot/reference/actuator/>
- Apache Kafka Consumer Design: <https://kafka.apache.org/documentation/#consumerconfigs>
