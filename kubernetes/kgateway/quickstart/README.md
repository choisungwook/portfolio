# kgateway quickstart

kgateway를 처음 만지는 사람이 Gateway API 라우팅과 kgateway 고유 정책까지 한 번에 훑는 핸즈온이다. 마지막에는 LLM 백엔드를 gateway 뒤에 놓고 생성 트래픽에 맞게 timeout과 retry를 조정한다.

실습 환경은 두 트랙이다. 라우팅 리소스는 두 트랙이 같고 백엔드만 다르다.

| 트랙 | 환경 | 다루는 것 |
|---|---|---|
| A | 맥 + kind 단일 노드 cluster | 설치, 라우팅, 정책, 시뮬레이터 LLM |
| B | GPU 1장이 달린 노드 한 대 | 같은 라우팅 위에 진짜 vLLM |

Track A만으로 끝까지 갈 수 있다. Track B는 GPU 추론까지 볼 때만 한다.

## 문서

| 문서 | 내용 |
|---|---|
| [1-why-kgateway.md](docs/1-why-kgateway.md) | Gateway API와 kgateway의 위치, kgateway CRD, AI 기능이 어디로 갔는지 |
| [2-setup.md](docs/2-setup.md) | Track A 환경: 맥 kind cluster와 kgateway 설치 |
| [3-routing.md](docs/3-routing.md) | httpbin, HTTPRoute, 가중치 분배 |
| [4-trafficpolicy.md](docs/4-trafficpolicy.md) | local rate limit, 헤더 변환 |
| [5-setup.md](docs/5-setup.md) | Track B 환경: GPU 노드 단일 cluster와 device plugin |
| [6-llm-routing.md](docs/6-llm-routing.md) | LLM 백엔드 라우팅, 생성 트래픽 timeout과 retry |
| [7-cleanup.md](docs/7-cleanup.md) | 두 트랙의 정리 절차 |

## 실습 리소스

- [manifests/](manifests/) — apply하는 YAML 전부. 파일별 설명은 그 안의 README에 있다

## 버전

| 대상 | 버전 |
|---|---|
| kgateway | v2.4.2 |
| Gateway API | v1.6.1 |
| NVIDIA device plugin | v0.19.3 |
