# 왜 PR Preview 라우팅에는 Gateway API가 어울릴까

공유 테스트 환경에서 PR 여러 개를 동시에 검증하면, 같은 서비스 이름과 같은 URL 뒤에 서로 다른 변경사항이 섞이기 쉽습니다. 그렇다면 PR Preview 환경은 매번 새 클러스터를 만들어야 할까요?

이 핸즈온은 그 질문을 kind 위에서 작게 재현합니다. 하나의 클러스터 안에 `main` 체인과 `pr-101` 체인을 같이 띄우고, HTTP 헤더로 어느 체인을 볼지 고릅니다.

## 왜 namespace만 나누면 충분하지 않을까

namespace를 PR마다 나누면 리소스 충돌은 줄어듭니다. 하지만 사용자가 들어오는 입구까지 같이 분리하지 않으면, 요청이 어떤 버전의 서비스로 들어갔는지 확인하기 어렵습니다.

PR Preview에서 중요한 것은 “Pod가 따로 떠 있다”가 아니라 “요청이 의도한 preview 체인으로 들어가고, 그 체인 안에서 다음 서비스까지 같은 맥락을 유지한다”입니다. 그래서 이 예제는 A Pod -> B Pod -> C Pod 호출을 만들고, `x-pr-preview` 헤더가 A에서 B, B에서 C까지 전달되는지 확인합니다.

## 왜 Ingress 대신 Gateway API를 쓸까

Ingress도 HTTP path나 host 기반 라우팅을 할 수 있습니다. 그런데 PR Preview처럼 라우팅 규칙이 점점 많아지는 상황에서는 Gateway API가 역할을 더 명확히 나눕니다.

Gateway API는 크게 `GatewayClass`, `Gateway`, `HTTPRoute`로 나뉩니다. `GatewayClass`는 어떤 controller가 처리할지 정하고, `Gateway`는 클러스터로 들어오는 입구를 만들고, `HTTPRoute`는 요청을 어느 backend로 보낼지 설명합니다.

이 구조의 장점은 운영자와 애플리케이션 작성자의 관심사를 나누기 쉽다는 점입니다. 예를 들어 플랫폼 담당자는 `Gateway`를 관리하고, 서비스 담당자는 자기 서비스의 `HTTPRoute`를 관리하는 식으로 역할을 분리할 수 있습니다.

단점도 있습니다. Ingress보다 리소스 종류가 많고, controller별 지원 기능 차이를 확인해야 합니다. 특히 header match, rewrite, filter 같은 기능은 구현체별 상태를 확인해야 합니다. 그래서 이 예제는 기능을 좁혀서 `x-pr-preview` header match만 사용합니다.

## 왜 Envoy Gateway를 선택했을까

이 저장소에는 이미 Envoy Gateway 기반 Gateway API 예제가 있습니다. 같은 도구를 쓰면 새 예제가 기존 학습 흐름과 이어지고, kind에서 HTTPRoute를 실습하기 쉽습니다.

Envoy Gateway를 선택했을 때 장점은 Gateway API 구현체로 바로 이해하기 좋고, Envoy 기반이라 HTTP 라우팅과 관찰 가능성 확장에 익숙한 선택이라는 점입니다. 또 로컬에서는 release manifest 하나로 controller를 설치할 수 있어 실습 진입 장벽이 낮습니다.

단점은 controller와 Envoy data plane이 추가로 떠야 하므로 단순 Ingress 예제보다 무겁다는 점입니다. 운영 환경에서는 GatewayClass, EnvoyProxy, TLS, 인증, 배포 전략까지 검토해야 합니다. 이 핸즈온은 그런 운영 설계를 다루지 않고, PR Preview 라우팅 원리만 작게 확인합니다.

## 모니터링은 왜 Zipkin만 넣었을까

APM 도구는 OpenTelemetry Collector, Jaeger, Grafana Tempo, Zipkin 같은 선택지가 있습니다. 이 예제는 Zipkin을 사용합니다.

장점은 단순합니다. 작은 HTTP API로 span을 받을 수 있어서 Python 서비스와 Spring Boot 서비스가 복잡한 agent 설정 없이 trace를 남길 수 있습니다. 로컬 실습에서는 “헤더가 이어졌는가”와 “호출 체인이 보이는가”를 빠르게 확인할 수 있습니다.

단점은 실제 운영 APM 구성을 그대로 재현하지 않는다는 점입니다. 운영에서는 OpenTelemetry SDK/Collector, sampling, trace retention, 로그/메트릭 연계까지 같이 봐야 합니다. 여기서는 PR Preview의 라우팅과 propagation을 보는 것이 목적이므로 Zipkin으로 범위를 줄였습니다.

## 정리하면 무엇을 확인하려는 걸까

정리하면, PR Preview 환경은 클러스터를 새로 만드는 문제만이 아니라 “입구 라우팅과 서비스 간 요청 맥락을 어떻게 유지할까”의 문제입니다. 이 예제는 Gateway API로 입구를 나누고, `x-pr-preview`와 `traceparent`를 서비스 간에 전달해서 그 맥락을 눈으로 확인합니다.

## 참고자료

- Envoy Gateway: <https://gateway.envoyproxy.io/>
- Kubernetes Gateway API: <https://gateway-api.sigs.k8s.io/>
- Zipkin API: <https://zipkin.io/zipkin-api/>
