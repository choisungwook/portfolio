# TrafficPolicy로 route에 정책 얹기

[3-routing.md](3-routing.md)에서 만든 `httpbin` HTTPRoute에 정책을 붙인다.

## 정책이 route를 참조한다

TrafficPolicy는 `targetRefs`로 대상을 가리킨다. 방향이 이쪽인 것이 중요하다.

- HTTPRoute에는 정책 관련 필드가 하나도 늘지 않는다. 앱 팀 YAML은 그대로다.
- 플랫폼 팀이 정책을 지우면 route는 살아 있고 정책만 사라진다.
- 같은 정책을 Gateway에 붙이면 그 Gateway를 지나는 모든 route에 적용된다. route에 붙은 더 좁은 정책이 이긴다.

## local rate limit

[httpbin-ratelimit-trafficpolicy.yaml](../manifests/policy/httpbin-ratelimit-trafficpolicy.yaml)은 30초에 3건만 통과시킨다. token bucket 방식이라 `maxTokens`가 순간에 몰아 쓸 수 있는 양이고, `fillInterval`마다 `tokensPerFill`만큼 다시 채운다.

local이라는 이름은 Envoy 파드가 자기 안에서 센다는 뜻이다. 별도 rate limit 서버가 필요 없는 대신, 프록시 replica가 늘면 한도도 replica 수만큼 늘어난다. 정확한 총량이 필요하면 `rateLimit.global`과 외부 서버를 쓴다.

```bash
kubectl apply -f manifests/policy/httpbin-ratelimit-trafficpolicy.yaml
```

다섯 번 연속으로 부르면 앞 세 번은 200, 나머지는 429가 나온다.

```bash
for i in $(seq 5); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/status/200 -H "host: httpbin.example.com"
done
```

## 헤더 변환

[httpbin-transformation-trafficpolicy.yaml](../manifests/policy/httpbin-transformation-trafficpolicy.yaml)은 요청에 `x-handson`을 넣고 응답에 `x-gateway`를 붙인다.

`set`과 `add`가 다르다. `set`은 같은 이름이 있으면 덮어쓰고, `add`는 뒤에 덧붙인다. 클라이언트가 보낸 값을 신뢰하면 안 되는 헤더는 `set`으로 덮어써야 한다.

```bash
kubectl apply -f manifests/policy/httpbin-transformation-trafficpolicy.yaml
```

httpbin의 `/headers`는 자기가 받은 요청 헤더를 그대로 돌려준다. 응답 본문에서 요청 변환을, 응답 헤더에서 응답 변환을 한 번에 확인할 수 있다.

```bash
curl -i http://localhost:8080/headers -H "host: httpbin.example.com"
```

본문에 `X-Handson: kgateway-quickstart`가, 헤더에 `x-gateway: kgateway`가 보이면 된다. rate limit이 아직 걸려 있어 429가 나오면 30초 기다렸다 다시 부른다.

## 정책이 안 먹을 때

TrafficPolicy도 status를 남긴다. 대상 이름을 틀리면 apply는 성공하고 아무 일도 일어나지 않으므로, 안 먹는다 싶으면 여기부터 본다.

```bash
kubectl get trafficpolicy -n httpbin -o yaml
```

`targetRefs`의 `group`과 `kind`까지 정확해야 한다. HTTPRoute는 `gateway.networking.k8s.io` 그룹이고 kgateway CRD 그룹이 아니다.

## 다음

여기까지가 kind에서 하는 Track A다. GPU 노드로 넘어가려면 [5-setup.md](5-setup.md)를, 환경을 정리하려면 [7-cleanup.md](7-cleanup.md)를 본다.
