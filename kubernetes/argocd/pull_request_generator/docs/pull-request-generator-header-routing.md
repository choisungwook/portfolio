# Pull Request Generator 헤더 기반 라우팅 테스트

이 문서는 ApplicationSet Pull Request Generator가 PR별 Application을 만들고, `Cookie` header가 있을 때만 해당 workload로 라우팅되는지 확인합니다.

## image 준비

로컬 kind cluster에 샘플 image를 로드합니다.

```bash
docker build -t pull-request-generator/pod-b:local apps/pod-b
kind load docker-image pull-request-generator/pod-b:local --name argocd-pr-generator
```

registry를 사용할 경우에는 `workload.image`를 registry image로 바꿉니다.

## ApplicationSet 설정

ApplicationSet 예제를 복사합니다.

```bash
cp manifests/applicationset/pull-request-generator.example.yaml \
  manifests/applicationset/pull-request-generator.yaml
```

필수 placeholder를 채웁니다.

```yaml
owner: "<GITHUB_OWNER>"
repo: "<GITHUB_REPO>"
labels:
  - "<PULL_REQUEST_LABEL>"
repoURL: "https://github.com/<MANIFEST_OWNER>/<MANIFEST_REPO>.git"
```

Helm parameter는 다음 값으로 시작합니다.

```yaml
- name: workload.name
  value: "app-workload"
- name: workload.image
  value: "pull-request-generator/pod-b:local"
- name: service.name
  value: "app-service"
```

optional HTTPRoute 주석을 해제하고 헤더 기반으로 설정합니다.

```yaml
- name: httpRoute.enabled
  value: "true"
- name: httpRoute.name
  value: "app-route"
- name: httpRoute.parentRef.name
  value: "ingress-gateway"
- name: httpRoute.parentRef.namespace
  value: "istio-ingress"
- name: httpRoute.hostname
  value: "app.local.test"
- name: httpRoute.header.enabled
  value: "true"
- name: httpRoute.header.name
  value: "cookie"
- name: httpRoute.header.value
  value: "(^|.*; )pod-chain-pr={{.number}}(;.*|$)"
```

주의: 위 값을 쓰려면 PR에 `<PULL_REQUEST_LABEL>` label이 붙어 있어야 합니다.

## ApplicationSet 적용

```bash
kubectl apply -f manifests/applicationset/pull-request-generator.yaml
kubectl get applicationset -n argocd
kubectl get application -n argocd
```

PR `123`을 기준으로 리소스를 확인합니다.

```bash
kubectl get deployment -n pr-123
kubectl get service -n pr-123
kubectl get httproute -n pr-123
kubectl describe httproute app-route -n pr-123
```

## 헤더 기반 호출 확인

Gateway Service가 port-forward 중이어야 합니다.

```bash
GATEWAY_SERVICE=$(kubectl get service -n istio-ingress -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward -n istio-ingress service/${GATEWAY_SERVICE} 8080:80
```

쿠키 없이 호출합니다.

```bash
curl -i http://app.local.test:8080/work
```

헤더 조건이 맞지 않으므로 대상 Service로 라우팅되지 않아야 합니다.

쿠키를 붙여 호출합니다.

```bash
curl -sS \
  --cookie 'pod-chain-pr=123' \
  http://app.local.test:8080/work
```

응답의 `namespace`가 `pr-123`이면 헤더 기반 라우팅이 동작한 것입니다.

```json
{
  "service": "pod-b",
  "namespace": "pr-123"
}
```

로그를 확인합니다.

```bash
kubectl logs -n pr-123 deployment/app-workload
```
