# kind에서 PR Preview 환경을 어떻게 띄울까

PR Preview 환경은 운영 클러스터에서만 확인해야 할까요? 라우팅 원리와 헤더 propagation만 확인하려면 kind에서도 충분히 작게 재현할 수 있습니다.

이 문서는 로컬 kind cluster에 Envoy Gateway, 예제 서비스, Zipkin을 배포하는 순서입니다.

## 어떤 도구가 필요할까

다음 도구가 필요합니다.

```bash
kind --version
kubectl version --client
docker version
curl --version
```

`make up`은 Docker image를 빌드하고 kind cluster에 로드합니다. 그래서 Docker daemon이 실행 중이어야 합니다.

## 왜 `make up` 하나로 묶었을까

핸즈온에서 중요한 것은 명령어를 외우는 것이 아니라, 어떤 단계가 필요한지 이해하는 것입니다. `make up`은 다음 일을 순서대로 실행합니다.

```bash
make up
```

이 명령은 kind cluster를 만들고, A/B/C 서비스 image를 빌드하고, image를 kind에 로드하고, Envoy Gateway와 예제 manifest를 배포합니다.

## 배포 상태는 어디서 볼까

배포가 끝나면 `pr-preview` namespace의 Pod 상태를 확인합니다.

```bash
kubectl get pod -n pr-preview
kubectl get gateway,httproute -n pr-preview
```

정상 상태라면 `service-a-main`, `service-b-main`, `service-c-main`, `service-a-pr-101`, `service-b-pr-101`, `service-c-pr-101`, `zipkin` Deployment가 준비됩니다.

## Gateway로 어떻게 요청을 보낼까

kind 환경에서는 cloud LoadBalancer가 없으므로 Gateway가 만든 Envoy Service를 port-forward해서 호출합니다.

```bash
make port_forward_gateway
```

다른 터미널에서 `main` 경로를 호출합니다.

```bash
make call_main
```

`x-pr-preview` 헤더를 넣으면 preview 체인으로 라우팅됩니다.

```bash
make call_preview
```

응답의 `version` 값이 `main`과 `pr-101`로 갈라지면 Gateway API 라우팅이 동작한 것입니다.

## 왜 Host 헤더를 넣을까

`HTTPRoute`는 `preview.localtest.me` hostname을 사용합니다. 로컬에서는 DNS를 새로 만들지 않고, `curl`의 `Host` 헤더로 같은 조건을 만듭니다.

장점은 `/etc/hosts`를 수정하지 않아도 된다는 점입니다. 단점은 브라우저로 바로 접근할 때는 hostname 설정을 따로 해야 한다는 점입니다. 브라우저 실습이 필요하면 `preview.localtest.me`가 `127.0.0.1`로 해석되는지 확인하고 사용합니다.

## 정리는 어떻게 할까

실습을 지울 때는 다음 명령을 사용합니다.

```bash
make down
make delete_kind
```

`make down`은 예제 manifest와 Envoy Gateway controller를 지우고, `make delete_kind`는 kind cluster 자체를 삭제합니다.

## 참고자료

- kind: <https://kind.sigs.k8s.io/>
- Envoy Gateway install: <https://gateway.envoyproxy.io/docs/install/install-yaml/>
