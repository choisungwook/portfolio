# HTTPRoute로 트래픽 보내기

환경은 [2-setup.md](2-setup.md)에서 만든 kind cluster를 쓴다. Gateway가 `PROGRAMMED=True`인 상태에서 시작한다.

## 샘플 앱 배포

kgateway 저장소의 httpbin 예제를 그대로 쓴다. `httpbin` namespace에 service 하나(port 8000)와 파드 하나가 뜬다.

```bash
kubectl apply -f https://raw.githubusercontent.com/kgateway-dev/kgateway/v2.4.2/examples/httpbin.yaml
```

```bash
kubectl get pods,svc -n httpbin
```

## HTTPRoute 붙이기

[httpbin-httproute.yaml](../manifests/routing/httpbin-httproute.yaml)은 `httpbin.example.com`으로 온 모든 경로를 httpbin service로 보낸다.

`parentRefs`가 다른 namespace의 Gateway를 가리키는 것이 핵심이다. HTTPRoute는 앱 namespace에 있고 Gateway는 인프라 namespace에 있다. 이 연결은 Gateway의 `allowedRoutes.namespaces.from: All`이 허용해 주기 때문에 성립한다.

```bash
kubectl apply -f manifests/routing/httpbin-httproute.yaml
```

route가 실제로 Gateway에 붙었는지는 status로 본다. apply 성공은 "YAML이 문법에 맞다"까지만 보장한다.

```bash
kubectl get httproute httpbin -n httpbin -o yaml
```

`Accepted=True`와 `ResolvedRefs=True`를 확인한다. backend service 이름을 틀리면 `ResolvedRefs=False`가 되고, 이때 요청은 500으로 떨어진다.

## 호출

kind가 30080을 localhost:8080으로 내보내고 있다. hostname 매칭이 걸려 있으므로 Host 헤더를 줘야 route를 탄다.

```bash
curl -i http://localhost:8080/status/200 -H "host: httpbin.example.com"
```

Host 헤더 없이 부르면 404가 나온다. 이것은 앱이 없다는 뜻이 아니라 어떤 listener의 어떤 route에도 매칭되지 않았다는 뜻이다.

```bash
curl -i http://localhost:8080/status/200
```

## 가중치 분배

두 번째 백엔드를 띄운다. 같은 이미지지만 service가 다르다.

```bash
kubectl apply -f manifests/routing/httpbin-v2-deployment.yaml
kubectl apply -f manifests/routing/httpbin-v2-service.yaml
```

[httpbin-split-httproute.yaml](../manifests/routing/httpbin-split-httproute.yaml)은 `split.example.com`을 v1에 80, v2에 20으로 나눈다. `weight`는 비율이지 백분율이 아니다. 합이 100일 필요가 없고 상대값으로만 계산된다.

응답 본문만 봐서는 어느 쪽이 받았는지 알 수 없으므로, backendRef마다 `ResponseHeaderModifier` 필터를 걸어 `x-version`을 붙인다. 게이트웨이가 자기가 고른 backend를 스스로 표시하게 하는 방식이라 앱을 고칠 필요가 없다.

```bash
kubectl apply -f manifests/routing/httpbin-split-httproute.yaml
```

스무 번 부르고 헤더만 세면 대략 16:4로 갈린다.

```bash
for i in $(seq 20); do
  curl -s -o /dev/null -D - http://localhost:8080/status/200 -H "host: split.example.com" \
    | grep -i '^x-version'
done | sort | uniq -c
```

호출 수가 적으면 비율이 꽤 흔들린다. Envoy는 요청마다 독립적으로 뽑을 뿐 20건 안에서 정확히 16:4를 맞춰 주지 않는다.

## 다음

이 route에 정책을 얹는 [4-trafficpolicy.md](4-trafficpolicy.md)로 넘어간다.
