# Graceful Shutdown

TL;DR: 현재 기본 manifest는 graceful server만 배포한다. `preStop sleep 30`과 `terminationGracePeriodSeconds: 35`로 endpoint drain 시간을 확보하지만, L4 proxy가 기존 TCP stream을 다른 backend Pod로 이전해 주는 것은 아니다.

## Manifest

| 파일 | 내용 |
|---|---|
| `manifests/tcp-echo/server-deployment.yaml` | `preStop sleep 30`, `terminationGracePeriodSeconds: 35` |

## 배포

server와 client는 한 번에 배포한다.

```bash
kubectl apply -f manifests/tcp-echo/
kubectl rollout status deploy/tcp-echo-server
```

## 종료 관찰

Pod 하나를 삭제하며 client 로그를 관찰한다.

```bash
kubectl get pods -l app.kubernetes.io/component=server
kubectl delete pod <server-pod-name>
kubectl logs deploy/tcp-echo-client-interval -f
```

## 판정

통과 기준은 client 로그에 `connection-error`가 없는지, 응답의 `hostname=...`이 어떻게 변하는지, proxy(Envoy 또는 HAProxy) 로그에 backend 연결 종료가 어떻게 찍히는지를 함께 보는 것이다.

확인 필요: nograceful 비교가 다시 필요하면 별도 적용 디렉터리를 추가해야 한다. 현재 핸즈온은 복잡도를 줄이기 위해 graceful server만 기본 배포한다.
