# 로컬 kind 핸즈온 (Envoy)

TL;DR: 로컬 kind에서 앱은 `kubectl apply -f manifests/tcp-echo/` 한 번으로 올리고, Envoy는 Helm chart로 설치한다. 모든 리소스는 default namespace에 둔다. 판정 기준은 client 로그의 `connection-error` 발생 여부이며, Envoy admin `/clusters`는 Pod별 health와 ejection을 보는 보조 화면이다.

## 전제

로컬에 다음 도구가 필요하다.

| 도구 | 용도 |
|---|---|
| Docker Desktop | kind 노드와 앱 이미지 빌드 |
| kind | 로컬 Kubernetes 클러스터 |
| kubectl | 리소스 배포와 로그 확인 |
| Helm | Envoy chart 설치와 values override |
| uv | Python 앱 로컬 실행과 lock 관리 |

## 리소스 배포

kind 클러스터를 생성한다.

```bash
kind create cluster --name haproxy-tcp --config kind/cluster.yaml
kubectl get nodes
```

`kind/cluster.yaml`은 host `localhost:2000`을 NodePort `32090`으로 연결한다. Envoy local Service가 같은 nodePort를 쓴다.

server/client 이미지를 빌드하고 kind 클러스터에 로드한다.

```bash
make build
make load_kind
```

server Service, headless Service, graceful server Deployment, interval client Deployment를 한 번에 배포한다.

```bash
kubectl apply -f manifests/tcp-echo/
kubectl rollout status deploy/tcp-echo-server
kubectl get pods,svc
kubectl get endpoints tcp-echo-server-headless
```

client Pod는 Envoy Service가 열릴 때까지 initContainer에서 기다린다.

Envoy를 Helm chart로 설치한다.

```bash
helm upgrade --install tcp-echo-envoy manifests/envoy \
  -f manifests/envoy/values.yaml \
  -f manifests/envoy/values-local.yaml
kubectl rollout status deploy/tcp-echo-envoy
```

## Envoy admin 확인

Envoy가 server Pod를 endpoint로 인식했는지 확인한다.

```bash
kubectl port-forward svc/tcp-echo-envoy-admin 9901:9901
curl -s http://127.0.0.1:9901/clusters | grep tcp_echo_cluster
```

`tcp_echo_cluster`에 server Pod 수만큼 endpoint가 `healthy`로 보여야 한다.

## 시나리오 1 - server Deployment 재시작

Kubernetes 안의 client Pod 로그를 한 터미널에서 계속 본다.

```bash
kubectl logs deploy/tcp-echo-client-interval -f
```

로컬 client 프로세스로도 같은 시나리오를 관찰한다.

```bash
HOST=127.0.0.1 PORT=2000 MODE=interval AUTO_RECONNECT=false uv run --project app python app/tcp-client/client.py
```

다른 터미널에서 server Deployment를 rolling restart한다.

```bash
kubectl rollout restart deploy/tcp-echo-server
kubectl rollout status deploy/tcp-echo-server
```

`AUTO_RECONNECT=false`는 기본 검증 조건이다. `connection-error`가 발생하면 handoff 실패이며, Envoy TCP(L4) mode가 기존 stream 이전 요구사항을 만족하지 못한 결과로 기록한다.

## 시나리오 2 - server Pod 단일 교체

server Pod 하나를 삭제해 backend Pod 장애와 유사한 상황을 만든다.

```bash
SERVER_POD=$(kubectl get pod -l app.kubernetes.io/component=server -o jsonpath='{.items[0].metadata.name}')
kubectl delete pod "$SERVER_POD"
```

`AUTO_RECONNECT=false`에서 `ConnectionError("server closed connection")`이 발생하면 이 시나리오는 실패다. 이 로그는 server Pod 로그가 아니라 client 쪽 로그이며, 기존 TCP stream이 다른 backend Pod로 이어지지 않았다는 증거다.

## 핵심 관찰

핵심 판단은 client 로그가 기준이다.

```bash
kubectl logs deploy/tcp-echo-client-interval -f
```

| 항목 | 의미 |
|---|---|
| `connection-error` 없음 | 통과. 같은 client TCP 연결이 유지됨 |
| `server closed connection` | 실패. backend 연결 종료가 client까지 전달됨 |
| `hostname=...` 변화 | 새 연결 또는 새 backend 선택이 관찰됨 |

Envoy access log는 client 오류 시점과 proxy의 연결 종료 시점을 맞춰볼 때 본다.

```bash
kubectl logs deploy/tcp-echo-envoy --tail=100 -f
```

server 로그는 backend가 실제로 어떤 connection을 처리했는지 볼 때만 본다.

```bash
kubectl logs deploy/tcp-echo-server --tail=100 -f
```

## Envoy endpoint와 통계

```bash
curl -s http://127.0.0.1:9901/clusters | grep tcp_echo_cluster
curl -s http://127.0.0.1:9901/stats | grep 'tcp_echo'
```

| 출력에서 볼 것 | 해석 |
|---|---|
| endpoint(`::ip:9090`) 줄 수 | Envoy가 인식한 server Pod 수 |
| `health_flags::healthy` | active health check 통과 endpoint |
| `health_flags::/failed_outlier_check` | outlier detection으로 ejection된 endpoint |
| `cx_active`, `cx_total` | endpoint별 활성/누적 연결 수 |

확인 필요: `replicaCount: 2`라 Service port-forward로 연 admin은 특정 Envoy Pod 하나의 화면이다. 두 Pod를 모두 보려면 Pod 이름으로 각각 port-forward한다. 요구사항 충족 여부의 최종 판단은 client 로그의 `connection-error` 발생 여부로 한다.

## 판정 기록

```text
proxy=envoy client_error=<yes/no> backend_changed=<yes/no> outlier_ejected=<yes/no> note=<short note>
```

## 로컬에서 직접 접속

host에서 수동 client를 실행하려면 Envoy NodePort 매핑을 사용한다.

```bash
HOST=127.0.0.1 PORT=2000 MODE=manual uv run --project app python app/tcp-client/client.py
```

## 리소스 정리

```bash
helm uninstall tcp-echo-envoy --ignore-not-found
kubectl delete -f manifests/tcp-echo/ --ignore-not-found
```

클러스터까지 지우려면 다음 명령을 실행한다.

```bash
kind delete cluster --name haproxy-tcp
```
