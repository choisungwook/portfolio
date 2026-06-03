# Envoy 설정

TL;DR: Kubernetes Ingress Controller나 Istio를 사용하지 않는다. Envoy를 로컬 Helm chart로 standalone Deployment로 띄우고, `values.yaml`의 `config`를 ConfigMap의 `envoy.yaml`로 렌더링한다. listener는 `:2000`에서 `tcp_proxy`로 받고, cluster는 `STRICT_DNS`로 server headless Service를 바라본다.

## 왜 로컬 Helm chart인가

이 실습은 Envoy 자체의 L4 동작을 관찰하는 것이 목적이다. Envoy Gateway나 xDS control plane을 끼우면 Gateway API/CRD와 control plane 동작까지 함께 봐야 한다. 그래서 chart는 Deployment, Service, ConfigMap만 렌더링하고, 실제 Envoy 설정은 `values.yaml`의 `config`에 그대로 둔다.

장점: HAProxy처럼 Helm 설치/삭제 흐름을 쓰면서도 Envoy 설정 전체가 한 파일에 보인다.

단점: chart template을 직접 유지해야 하고, endpoint 변화를 xDS로 push받지 못하므로 `STRICT_DNS`의 DNS 재해석 주기에 의존한다.

## listener

client 연결은 `:2000` listener에서 `tcp_proxy` 필터로 받는다.

```yaml
filters:
  - name: envoy.filters.network.tcp_proxy
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.network.tcp_proxy.v3.TcpProxy
      stat_prefix: tcp_echo
      cluster: tcp_echo_cluster
      idle_timeout: 600s
```

`tcp_proxy`는 Layer 4 필터다. payload를 해석하지 않고 byte stream을 그대로 relay한다. 따라서 backend가 죽었을 때 같은 stream을 다른 Pod로 이어주는 동작은 이 필터에 없다. 이것은 HAProxy `mode tcp`와 같은 성질이며, [TCP session migration 한계](tcp-session-migration.md)에서 다룬 L4 프록시의 근본 제약이다.

## cluster와 STRICT_DNS

cluster는 server를 어떻게 찾고 고를지를 정의한다.

```yaml
clusters:
  - name: tcp_echo_cluster
    connect_timeout: 5s
    type: STRICT_DNS
    dns_lookup_family: V4_ONLY
    lb_policy: ROUND_ROBIN
    load_assignment:
      cluster_name: tcp_echo_cluster
      endpoints:
        - lb_endpoints:
            - endpoint:
                address:
                  socket_address:
                    address: tcp-echo-server-headless
                    port_value: 9090
```

`STRICT_DNS`는 지정한 DNS 이름의 모든 A 레코드를 endpoint로 만든다. server를 **headless Service**(`clusterIP: None`)로 노출했기 때문에 DNS는 가상 IP 하나가 아니라 server Pod IP 전부를 돌려준다. 그래서 Envoy는 각 Pod를 개별 endpoint로 인식하고 직접 load balancing한다.

이것이 archive된 HAProxy 구성과의 핵심 차이다. HAProxy 구성은 `backend`를 `tcp-echo-server` Service DNS 하나로 두고 endpoint 선택을 kube-proxy에 맡겼다. Envoy는 Pod 단위로 보기 때문에 Pod별 health와 ejection을 관측할 수 있다.

## health check와 outlier detection

active health check는 endpoint에 직접 TCP 연결을 시도해 죽은 Pod를 LB 대상에서 뺀다.

```yaml
health_checks:
  - timeout: 2s
    interval: 2s
    unhealthy_threshold: 3
    healthy_threshold: 2
    tcp_health_check: {}
```

outlier detection은 실제 요청 연결에서 연속 실패가 누적되면 해당 endpoint를 일정 시간 ejection한다.

```yaml
outlier_detection:
  split_external_local_origin_errors: true
  consecutive_local_origin_failure: 3
  interval: 5s
  base_ejection_time: 30s
  max_ejection_percent: 50
```

`split_external_local_origin_errors: true`는 TCP 연결 수립 실패(local origin failure)를 별도로 세겠다는 뜻이다. raw TCP에는 HTTP 5xx가 없으므로 이 설정으로 연결 실패를 ejection 신호로 쓴다.

중요한 구분: 두 기능 모두 **새 연결**을 건강한 Pod로 보내기 위한 장치다. 이미 relay 중인 client 연결의 backend가 죽으면, 그 연결은 다른 Pod로 이전되지 않는다.

## admin과 access log

admin은 `:9901`에서 `/ready`, `/stats`, `/clusters`를 제공한다.

```yaml
admin:
  address:
    socket_address:
      address: 0.0.0.0
      port_value: 9901
```

`tcp_proxy`의 access log는 stdout으로 보낸다. 연결마다 한 줄씩 찍혀 HAProxy `option tcplog`와 비슷하게 연결 단위 관측이 가능하다.

```yaml
access_log:
  - name: envoy.access_loggers.stdout
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
```

## 이미지 버전

`manifests/envoy/values.yaml`은 `envoyproxy/envoy:v1.38-latest`를 사용한다. 이 태그는 v1.38.x 안정 라인의 패치를 추종한다. 안정 라인을 올릴 때는 [Envoy releases](https://github.com/envoyproxy/envoy/releases)에서 현재 stable을 확인한다.

확인 필요: Envoy의 typed_config `@type` 경로는 major API version(v3) 기준이며, 아주 오래된/새로운 Envoy로 바꾸면 필드 호환성을 확인해야 한다.
