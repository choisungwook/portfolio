# Argo CD Pull Request Generator hands-on

하나의 테스트 환경을 여러 팀이 같이 쓸 때, PR별 임시 workload, service network, Gateway route를 만들어 변경사항 충돌을 줄이는 흐름을 kind에서 확인하는 핸즈온입니다.

예제 애플리케이션은 디버깅을 쉽게 하기 위해 FastAPI sample image를 제공합니다. 실제 app chart는 특정 Pod A/B 이름에 묶이지 않고 Deployment, Service, optional Gateway API route를 값으로 조정합니다.

## 문서

- [purpose](./docs/purpose.md)
- [setup](./docs/setup.md)
- [Helm chart Gateway 호출 테스트](./docs/helm-chart-gateway-test.md)
- [Pull Request Generator 헤더 기반 라우팅 테스트](./docs/pull-request-generator-header-routing.md)
