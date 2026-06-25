# 목표

이 디렉터리는 하나의 공유 테스트 환경을 여러 팀이 같이 쓸 때 PR별 변경이 서로 섞이지 않도록 하는 핸즈온이다. PR이 열리면 Argo CD ApplicationSet Pull Request Generator가 PR 번호를 읽고, 임시 workload와 Service를 만든다. Gateway API `HTTPRoute`는 옵션이다.

외부 사용자의 요청은 Istio Gateway API와 optional `HTTPRoute`로 처리한다. 내부 Service FQDN 호출은 ingress Gateway를 지나지 않으므로 Istio Ambient waypoint와 mesh route를 별도 검증 대상으로 둔다. 샘플 FastAPI app은 디버깅용이며, 실제 Helm chart 구조는 특정 Pod A/B 이름에 의존하지 않고 Deployment, Service, optional Gateway API 설정을 값으로 조정한다.

## 디렉터리 구조와 설명

| 경로 | 설명 |
| --- | --- |
| `README.md` | 문서 링크 허브 |
| `Makefile` | kind cluster 생성/삭제와 multi-arch image build/push |
| `kind/cluster.yaml` | `kindest/node:v1.36.1`, control-plane 1개와 worker 1개, Argo CD용 host port mapping |
| `apps/pod-a` | 디버깅용 FastAPI caller sample image |
| `apps/pod-b` | 디버깅용 FastAPI workload sample image |
| `manifests/argocd` | Argo CD 설치와 `argocd-server` NodePort patch |
| `manifests/gateway` | Istio `GatewayClass istio`에 붙는 ingress `Gateway` |
| `manifests/applicationset` | GitHub App 인증 Secret 예제와 Pull Request Generator ApplicationSet 예제 |
| `manifests/baseline` | 공유 원본 Service와 Istio waypoint를 배포하는 Helm chart |
| `manifests/app` | Deployment, Service, optional `HTTPRoute` 하나를 배포하는 Helm chart |
| `docs` | 목적, 설치, Helm chart Gateway 호출, Pull Request Generator 헤더 라우팅 문서 |

## 핵심 ADR

- app chart는 Helm chart로 유지한다. 단, ApplicationSet은 Helm chart repository가 아니라 GitHub repository의 `main` branch에 있는 chart path를 바라본다.
- Pull Request Generator가 읽는 PR repository와 Argo CD가 chart를 읽는 manifest repository는 구분한다. 두 repository가 다르면 GitHub App installation에 둘 다 포함되어야 한다.
- 민감정보가 들어가는 manifest는 `.example.yaml`로만 커밋한다. 실제 파일은 복사해서 작성하고 `.gitignore`로 제외한다.
- app chart와 baseline chart는 `Namespace`를 만들지 않는다. chart 리소스의 `metadata.namespace`는 `{{ .Release.Namespace }}`를 사용한다.
- PR namespace는 ApplicationSet의 `destination.namespace`, `CreateNamespace=true`, `managedNamespaceMetadata`로 관리한다. baseline namespace는 chart 설치 전에 만들고 `istio.io/dataplane-mode=ambient`, `istio.io/use-waypoint=waypoint` label을 붙인다.
- app chart는 `Deployment`와 `Service`를 항상 배포한다. `HTTPRoute`는 `httpRoute.enabled=true`일 때 하나만 배포한다. 헤더 기반 라우팅은 `httpRoute.header.enabled=true`로 켠다.
- 역할별로 여러 `HTTPRoute` 템플릿을 나누지 않는다. 같은 chart에서 route가 필요하면 optional `HTTPRoute` 하나의 parent, hostname, header 값을 조정한다.
- Gateway API CRD는 Istio 설치 전에 먼저 설치한다. `gatewayclass` 리소스 타입이 없으면 CRD가 빠진 것이다.
- 별도 Gateway controller로 Envoy Gateway를 설치하지 않는다. 외부 ingress route는 Istio `GatewayClass istio`가 담당한다.
- Pod 내부에서 원본 Service FQDN을 직접 호출하는 service-to-service 트래픽은 ingress Gateway를 지나지 않으므로 Istio Ambient waypoint가 필요하다.
- 쿠키 기반 route는 애플리케이션이 PR 번호를 해석하는 방식이 아니다. proxy가 요청 header를 보고 backend를 고른다. 다만 내부 호출까지 같은 기준으로 라우팅하려면 caller의 outbound 요청에 mesh가 볼 수 있는 header가 있어야 한다.
- baseline fallback route와 PR별 mesh route를 같은 parent Service에 여러 개 붙일 때 route merge 동작은 controller별 확인 필요이다. 현재 app chart는 mesh 전용 route와 `ReferenceGrant`를 만들지 않는다. 운영형 내부 route는 별도 manifest나 chart로 분리해 검증한다.
