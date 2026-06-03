# HAProxy 리스크

TL;DR: HAProxy를 추가해도 live TCP stream이 무조건 보존되는 것은 아니다. 특히 backend Pod 죽음, HAProxy Pod 죽음, stateful protocol은 별도 리스크로 봐야 한다.

## Backend Pod 종료

TCP mode에서 HAProxy는 client connection에 대해 backend connection을 하나 선택해 relay한다. backend connection이 끊겼을 때 동일한 TCP stream을 다른 Pod로 이어 붙인다고 가정하면 위험하다.

장점: backend Pod 종료 영향을 client와 proxy 로그에서 분리해 볼 수 있다.

단점: 장기 세션이 stateful protocol이면 backend 변경 또는 연결 종료가 애플리케이션 의미를 깨뜨릴 수 있다.

## Handoff 옵션 오해

이 실습에서 HAProxy가 live TCP stream handoff를 해줄 것으로 기대하게 만드는 HAProxy 옵션은 없다.

| 항목 | 의미 | handoff 여부 |
|---|---|---|
| `mode tcp` | payload를 해석하지 않고 TCP byte stream을 relay | handoff 아님 |
| `balance roundrobin` | 새 backend connection 선택 방식 | 기존 stream 이전 아님 |
| `option tcp-check` | backend health check | 기존 stream 이전 아님 |
| `timeout client/server` | idle/active connection 유지 시간 | backend 사망 시 이전 아님 |
| client `AUTO_RECONNECT=false` | 같은 client connection이 유지되어야 한다는 요구사항을 검증하는 기본 설정 | HAProxy 옵션 아님 |
| client `AUTO_RECONNECT=true` | 연결 종료 후 client가 새 connection을 맺는 복구 설정 | handoff 아님 |

`AUTO_RECONNECT=false` 상태에서 `ConnectionError("server closed connection")`이 발생하면, 이는 요구사항 미충족이다. HAProxy가 기존 TCP stream을 새 backend Pod로 넘겨주지 못했다는 관찰 결과이며, 이 로그는 server Pod 로그가 아니라 client 쪽 로그다.

## HAProxy Pod 종료

HAProxy replica가 두 개여도 replica 간 live TCP session 공유는 없다. 어떤 client가 붙은 HAProxy Pod가 종료되면 그 client connection은 끊길 수 있다.

완화책은 다음과 같다.

| 리스크 | 완화책 |
|---|---|
| HAProxy rollout 중 연결 종료 | PodDisruptionBudget, 낮은 maxUnavailable, 충분한 termination grace |
| Karpenter consolidation | HAProxy Pod anti-affinity, disruption budget, critical workload 분리 |
| client 장애 체감 | client reconnect/backoff와 idempotent request 설계 |

## Stateful query 리스크

세션 내부에 인증 상태, transaction 상태, cursor, prepared statement 같은 server-local state가 있으면 backend Pod 변경 또는 연결 종료가 잘못된 쿼리 실행처럼 보일 수 있다.

완화책은 다음과 같다.

| 방식 | 장점 | 단점 |
|---|---|---|
| client reconnect + protocol resume | 장애 처리 지점이 명확함 | 애플리케이션 구현 필요 |
| server state 외부화 | Pod 교체 영향 감소 | 저장소 비용과 복잡도 증가 |
| sticky session | backend 변경 감소 | Pod 종료 자체는 해결하지 못함 |
| drain 시간 확보 | 배포/삭제 중 in-flight 감소 | 강제 종료와 node 장애에는 한계 |

## 판정

확인 필요: 이 아키텍처가 해결할 수 있는 범위는 "일부 graceful 종료 중 in-flight 완화"인지, "client 세션 유지"인지 실험 결과로 구분해야 한다.
