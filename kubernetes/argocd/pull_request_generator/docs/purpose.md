# 목적

하나의 테스트 환경을 여러 팀이 같이 쓰면 PR별 변경이 쉽게 섞입니다. 이 실습의 목적은 테스트 환경을 여러 개 만드는 것이 아니라, 한 cluster 안에서 PR마다 임시 workload와 Service를 만들고 필요한 경우 Gateway API route를 붙여 충돌을 줄이는 것입니다.

Argo CD ApplicationSet Pull Request Generator는 열린 PR을 읽고 PR 번호별 Application을 만듭니다. Application은 GitHub repository의 `main` branch에 있는 Helm chart를 sync합니다. chart는 기본적으로 `Deployment`와 `Service`를 배포하고, `httpRoute.enabled=true`일 때만 `HTTPRoute`를 하나 더 배포합니다.

외부 접속은 Istio Gateway API로 확인합니다. `GatewayClass istio`를 사용하므로 별도 Envoy Gateway controller는 설치하지 않습니다. 내부 service-to-service 트래픽은 외부 Gateway를 지나지 않으므로 Istio Ambient waypoint로 별도 검증해야 하며, cross-namespace mesh route 구성은 확인 필요입니다.

## 구조

| 항목 | 역할 |
|---|---|
| kind | 로컬 Kubernetes cluster |
| Argo CD | ApplicationSet과 Application sync |
| GitHub App | PR 목록과 manifest repository 읽기 |
| Istio Ambient | mesh와 Gateway API controller |
| Gateway | 외부 HTTP 진입점 |
| app chart | `Deployment`, `Service`, optional `HTTPRoute` |

## 장단점

| 방식 | 장점 | 단점 |
|---|---|---|
| PR별 workload | 공유 테스트 환경을 유지하면서 PR 단위 확인 가능 | DB, queue 같은 외부 의존성은 별도 격리 필요 |
| optional HTTPRoute | 일반 배포와 헤더 기반 라우팅을 같은 chart로 처리 | route를 여러 개 동시에 만들려면 chart 확장 필요 |
| GitHub App | PAT 교체 부담 감소, repository 단위 권한 설정 가능 | App ID, Installation ID, private key 관리 필요 |
