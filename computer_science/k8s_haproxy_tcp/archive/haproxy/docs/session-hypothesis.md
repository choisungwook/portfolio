# 가설 검증

TL;DR: 이 실습의 핵심은 backend server Pod 종료 시 client와 일반 HAProxy Pod 사이 연결이 유지되는지 확인하는 것이다. 연결이 끊기면 요구사항 미충족이며, HAProxy TCP mode가 live stream handoff를 제공하지 못한 결과로 기록한다.

## 준비

graceful server, interval client, Helm으로 설치한 HAProxy를 배포한다.

```bash
helm repo add haproxytech https://haproxytech.github.io/helm-charts
helm repo update
kubectl apply -f archive/haproxy/manifests/tcp-echo/
helm upgrade --install tcp-echo-haproxy haproxytech/haproxy \
  --version 1.29.0 \
  -f archive/haproxy/manifests/haproxy/values.yaml \
  -f archive/haproxy/manifests/haproxy/values-local.yaml
kubectl logs deploy/tcp-echo-client-interval -f
```

## 관측 창

client 로그와 server Pod 목록을 동시에 본다.

```bash
kubectl get pods -w
```

HAProxy 로그도 별도 터미널에서 본다.

```bash
kubectl logs deploy/tcp-echo-haproxy -f
```

## Pod 삭제 실험

server Pod 하나를 삭제한다.

```bash
kubectl delete pod <server-pod-name>
```

## 확인 항목

| 항목 | 기대 관찰 |
|---|---|
| client 오류 | `connection-error`가 없어야 통과 |
| backend hostname | 응답의 `hostname=...` 변화 여부 |
| HAProxy log | frontend session과 backend 종료 로그 |
| Kubernetes 상태 | 새 server Pod 생성과 Ready 전환 |

`AUTO_RECONNECT=false` 상태의 client에서 `ConnectionError("server closed connection")`이 발생하면 이 실험은 실패다. 이 로그는 server Pod 로그가 아니라 client 쪽 로그이며, 기존 TCP stream이 다른 backend Pod로 이어지지 않았다는 증거로 기록한다.

핵심 시나리오에서는 `AUTO_RECONNECT=true`를 사용하지 않는다. 재연결은 client 장애 복구 UX를 보기 위한 별도 실험이며, 이 요구사항의 통과 조건이 아니다.

## 추가 네트워크 확인

client가 로컬 프로세스라면 다음 명령으로 소켓 상태를 본다.

```bash
ss -tnp | grep ':2000'
```

macOS에서는 다음 명령을 사용한다.

```bash
lsof -nP -iTCP:2000
```

패킷 레벨 RST/FIN을 확인한다.

```bash
sudo tcpdump -i any tcp port 2000
```

## 판정 기록

결과는 다음 한 줄로 기록한다.

```text
proxy=haproxy client_error=<yes/no> backend_changed=<yes/no> rst_or_fin=<yes/no> note=<short note>
```

장점: 이 포맷은 Envoy 판정 기록과 나란히 비교하기 쉽다.

단점: 원인 분석에는 HAProxy log와 tcpdump 시각을 맞춰야 한다.
