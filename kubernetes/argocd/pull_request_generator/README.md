# Argo CD Pull Request Generator hands-on

하나의 테스트 환경을 여러 팀이 같이 쓸 때, PR별 임시 workload, service network, Gateway API mesh route를 만들어 변경사항 충돌을 줄이는 흐름을 kind에서 확인하는 핸즈온입니다.

예제 애플리케이션은 디버깅을 쉽게 하기 위해 FastAPI sample image를 제공합니다. test client는 운영 Service 주소처럼 `app-service.prod.svc.cluster.local`을 호출하고, Istio Ambient waypoint가 헤더를 보고 PR Service로 라우팅합니다. 샘플 애플리케이션은 로그 목적 외에는 header를 읽거나 복사하지 않습니다.

## 문서

- [1. purpose](./docs/1-purpose.md)
- [2. setup](./docs/2-setup.md)
- [3. Helm chart mesh route 테스트](./docs/3-helm-chart-gateway-test.md)
- [4. Pull Request Generator 헤더 기반 mesh route 테스트](./docs/4-pull-request-generator-header-routing.md)
