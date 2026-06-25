# kind에서 Kafka를 먼저 띄우는 이유

Kafka를 공부할 때 가장 먼저 막히는 지점은 broker 자체보다 실행 환경입니다. 로컬에서 Docker Compose로 바로 띄우면 빠르지만, Kubernetes에서 서비스 이름과 Pod 생명주기가 메시징 시스템에 어떤 영향을 주는지 보기 어렵습니다. 그래서 이 핸즈온은 왜 kind cluster에서 Kafka를 먼저 띄울까요?

## 왜 Docker Compose가 아니라 kind로 시작할까요?

Docker Compose는 빠르게 Kafka를 실행할 수 있다는 장점이 있습니다. 단점은 Kubernetes Service, Deployment, readiness probe, NodePort 같은 운영 환경의 기본 단서를 함께 보지 못한다는 점입니다.

kind는 로컬 Docker 위에 Kubernetes cluster를 만들기 때문에 실제 운영 cluster와 완전히 같지는 않습니다. 하지만 학습 목적에서는 Service DNS, Pod 재시작, manifest 적용 흐름을 같이 볼 수 있습니다. **Kafka를 Kubernetes에서 사용할 때 헷갈리는 부분은 broker보다 네트워크 이름과 실행 순서에서 자주 드러납니다.**

## 어떤 구조로 실행될까요?

이 예제는 단일 namespace 안에 Kafka, Spring Boot 애플리케이션, Prometheus, Grafana를 둡니다. 학습 목적이므로 Kafka는 단일 broker로 실행하고, 데이터는 `emptyDir`에 저장합니다.

장점은 구조가 단순해서 pub/sub 흐름에 집중할 수 있다는 점입니다. 단점은 broker 장애, 데이터 보존, multi broker replication 같은 운영 주제를 다루지 못한다는 점입니다. 운영 Kafka를 구성하려면 Strimzi 또는 Confluent Operator 같은 선택지도 검토해야 합니다. 이 문서에서는 로컬 학습 범위를 넘기 때문에 다루지 않습니다.

## kind cluster는 어떻게 만들까요?

다음 명령은 kind cluster를 만들고 애플리케이션 이미지를 빌드한 뒤 cluster에 로드하고 manifest를 적용합니다.

```sh
make up
```

명령이 성공하면 다음 리소스를 확인합니다.

```sh
kubectl -n kafka get pods
kubectl -n kafka get svc
```

`kafka` Deployment가 먼저 준비되고, 그 다음 `kafka-pubsub-app`이 Kafka bootstrap server인 `kafka:9092`로 연결합니다.

## Kafka manifest에서 무엇을 봐야 할까요?

Kafka는 `manifests/10-kafka.yaml`에 있습니다. 이 예제는 Confluent Kafka image를 KRaft mode로 실행합니다. ZooKeeper를 따로 두지 않는 대신, broker와 controller 역할을 한 Pod가 같이 수행합니다.

확인해야 할 값은 세 가지입니다.

1. `KAFKA_LISTENERS`: Kafka container가 어떤 주소와 port에서 listen하는지 정합니다.
2. `KAFKA_ADVERTISED_LISTENERS`: client에게 어떤 주소로 접속하라고 알려줄지 정합니다.
3. `KAFKA_AUTO_CREATE_TOPICS_ENABLE`: 실습을 단순하게 하기 위해 topic 자동 생성을 켭니다.

topic 자동 생성은 실습에서는 편합니다. 장점은 별도 topic 생성 Job 없이 바로 메시지를 보낼 수 있다는 점입니다. 단점은 운영에서 오타 topic이 자동 생성될 수 있다는 점입니다. 운영에서는 topic을 명시적으로 만들고 replication factor, partition 수, retention을 관리하는 편이 안전합니다.

## 정리는 어떻게 할까요?

실습 리소스만 지우려면 다음 명령을 사용합니다.

```sh
make down
```

kind cluster까지 지우려면 다음 명령을 사용합니다.

```sh
make delete_kind
```

정리하면, 이 핸즈온이 kind에서 Kafka를 먼저 띄우는 이유는 broker 실행보다 Kubernetes 안에서 client가 Kafka를 어떻게 찾는지 보기 위해서입니다. Docker Compose보다 느릴 수 있지만, Service DNS와 probe까지 함께 볼 수 있다는 점이 이 실습의 핵심입니다.

## 참고자료

- Apache Kafka Documentation: <https://kafka.apache.org/documentation/>
- Confluent Docker Configuration Reference: <https://docs.confluent.io/platform/current/installation/docker/config-reference.html>
- kind Documentation: <https://kind.sigs.k8s.io/>
