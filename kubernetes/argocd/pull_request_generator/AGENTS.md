# 목표

이 디렉터리는 하나의 공유 테스트 환경을 여러 팀이 같이 쓸 때 PR별 변경이 서로 섞이지 않도록 하는 핸즈온이다. PR이 열리면 Argo CD ApplicationSet Pull Request Generator가 PR 번호를 읽고, 임시 workload와 Service를 만든다. Gateway API `HTTPRoute`는 옵션이다.

운영 시나리오의 핵심 호출 주소는 Service FQDN이다. client는 `app-service.prod.svc.cluster.local` 같은 주소를 호출하고, Istio Ambient waypoint가 Gateway API mesh `HTTPRoute`를 보고 prod fallback으로 보낼지 PR Service로 보낼지 결정한다. 샘플 FastAPI app은 디버깅용이며, 실제 Helm chart 구조는 특정 Pod A/B 이름에 의존하지 않고 Deployment, Service, optional Gateway API 설정을 값으로 조정한다.

## 디렉터리 구조와 설명

| 경로 | 설명 |
| --- | --- |
| `README.md` | 문서 링크 허브 |
| `Makefile` | kind cluster 생성/삭제와 Docker Hub multi-arch image build/push |
| `kind/cluster.yaml` | `kindest/node:v1.36.1`, control-plane 1개와 worker 1개, Argo CD용 host port mapping |
| `apps/pod-a` | 디버깅용 FastAPI caller sample image. header forwarding 검증에는 사용하지 않는다 |
| `apps/pod-b` | 디버깅용 FastAPI workload sample image |
| `manifests/argocd` | Argo CD 설치와 `argocd-server` NodePort patch |
| `manifests/gateway` | Istio Ambient shared waypoint `Gateway` |
| `manifests/applicationset` | GitHub App 인증 Secret 예제와 Pull Request Generator ApplicationSet 예제 |
| `manifests/app` | prod Service와 PR Service를 같은 템플릿으로 배포하는 Helm chart |
| `docs` | 목적, 설치, Helm chart mesh route, Pull Request Generator 헤더 라우팅 문서 |

## 핵심 ADR

- app chart는 Helm chart로 유지한다. 단, ApplicationSet은 Helm chart repository가 아니라 GitHub repository의 `main` branch에 있는 chart path를 바라본다.
- Pull Request Generator가 읽는 PR repository와 Argo CD가 chart를 읽는 manifest repository는 구분한다. 두 repository가 다르면 GitHub App installation에 둘 다 포함되어야 한다.
- 민감정보가 들어가는 manifest는 `.example.yaml`로만 커밋한다. 실제 파일은 복사해서 작성하고 `.gitignore`로 제외한다.
- app chart는 `Namespace`를 만들지 않는다. `Deployment`와 `Service`는 `{{ .Release.Namespace }}`에 만들고, `HTTPRoute`와 `ReferenceGrant`는 Gateway API attachment에 필요한 namespace에 명시적으로 만든다.
- `docs/`의 실습 문서는 읽는 순서가 보이도록 `1-`, `2-` 같은 숫자 prefix를 파일명에 붙인다.
- shared waypoint는 `manifests/gateway/gateway.yaml`에서 `gatewayClassName: istio-waypoint`, `protocol: HBONE`, `port: 15008`로 만든다. 이 리소스는 외부 ingress가 아니다.
- shared waypoint는 여러 namespace의 Service가 붙어야 하므로 listener의 `allowedRoutes.namespaces.from`을 `All`로 둔다. Service status에 `istio.io/WaypointBound=False`, `AttachmentDenied`, `missing allowedRoutes?`가 보이면 이 설정부터 확인한다.
- PR namespace는 ApplicationSet의 `destination.namespace`, `CreateNamespace=true`, `managedNamespaceMetadata`로 관리한다. `managedNamespaceMetadata`에는 `istio.io/dataplane-mode=ambient`, `istio.io/use-waypoint=waypoint`, `istio.io/use-waypoint-namespace=istio-waypoint` label을 넣는다.
- prod namespace와 test client namespace는 chart 설치 전에 만들고 PR namespace와 같은 Ambient/waypoint label을 붙인다.
- app chart의 `Service`에는 shared waypoint 등록 label인 `istio.io/use-waypoint`와 `istio.io/use-waypoint-namespace`를 붙인다.
- app chart는 `Deployment`와 `Service`를 항상 배포한다. `HTTPRoute`는 `httpRoute.enabled=true`일 때 하나만 배포한다. `httpRoute.enabled` 기본값은 `false`다. PR별 route는 prod namespace에서 이름이 충돌하지 않도록 `app-route-pr-<PR번호>`처럼 고유하게 만든다.
- 운영 기준 Service도 별도 chart를 만들지 않고 app chart를 `prod` namespace에 `httpRoute.enabled=false`로 설치한다.
- `HTTPRoute`의 기본 parent는 외부 Gateway나 waypoint Pod가 아니라 prod `Service`이다. parentRef의 core `Service` group은 빈 문자열(`group: ""`)로 명시한다. client는 prod Service FQDN을 호출한다. header match가 없으면 prod fallback backend로 가고, header match가 되면 PR Service backend로 간다.
- `HTTPRoute`는 parent Service가 있는 `prod` namespace에 만든다. Istio 1.30.2 live 확인 기준으로 PR namespace에 둔 cross-namespace Service parent route는 `Accepted=True`여도 waypoint `proxy-config routes`에 header route가 내려가지 않는 사례가 있었다. 정확한 버전별 동작은 확인 필요이다.
- `HTTPRoute`가 prod namespace에 있으므로 PR Service backend 접근을 허용하기 위해 app chart는 route가 켜졌을 때 PR namespace에 `ReferenceGrant`를 만든다.
- ApplicationSet이 만든 PR Application은 PR namespace의 workload와 prod namespace의 `HTTPRoute`를 함께 관리한다. 제한된 AppProject를 쓰면 prod namespace 리소스 관리 권한을 확인해야 한다.
- Service parent에 `HTTPRoute`를 붙이면 기본 서비스 라우팅이 route 규칙으로 대체될 수 있다. header match rule 뒤에 prod Service fallback rule을 함께 렌더링한다.
- 역할별로 여러 `HTTPRoute` 템플릿을 나누지 않는다. 같은 chart에서 route가 필요하면 optional `HTTPRoute` 하나의 parent, hostname, header 값을 조정한다.
- Gateway API CRD는 Istio 설치 전에 먼저 설치한다. `gatewayclass` 리소스 타입이 없으면 CRD가 빠진 것이다.
- 별도 Gateway controller로 Envoy Gateway를 설치하지 않는다.
- Pod 내부에서 원본 Service FQDN을 직접 호출하는 service-to-service 트래픽은 ingress Gateway를 지나지 않으므로 Istio Ambient waypoint가 필요하다.
- 쿠키 기반 route는 애플리케이션이 PR 번호를 해석하는 방식이 아니다. proxy가 요청 header를 보고 backend를 고른다. 샘플 애플리케이션은 로그 목적 외에는 header를 읽거나 downstream 요청에 header를 복사하지 않는다.
- 디버깅할 때 `HTTPRoute` status만 보지 않는다. `gateway.networking.k8s.io/gateway-name=waypoint` label로 waypoint Pod 이름을 찾고, `istioctl proxy-config routes <waypoint-pod> -n istio-waypoint --name 'inbound-vip|8080|http|app-service.prod.svc.cluster.local' -o json`에서 header route와 fallback route가 실제로 내려갔는지 확인한다.
- 실습 문서에는 시나리오 1과 시나리오 2의 호출 관계를 Mermaid로 표시한다. 로컬 PC가 직접 Service FQDN을 호출하는 것이 아니라 cluster 내부 `curl-client` Pod가 호출한다는 점을 명시한다. `curl-client`는 Deployment가 아니라 단일 Pod로 만들고, 호출은 `kubectl exec`로 실행한다. `kubectl exec` 출력은 로컬 PC의 `jq`로 파싱한다.
- 샘플 image 기본 주소는 `choisunguk/pull-request-generator:v1`이다. Makefile은 `pod-b`를 이 tag로 push하고, caller용 `pod-a`는 `choisunguk/pull-request-generator:pod-a-v1`로 push한다.
