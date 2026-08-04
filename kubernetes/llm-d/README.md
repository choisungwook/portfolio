# llm-d quickstart 핸즈온

[llm-d](https://llm-d.ai/)는 Kubernetes 위에서 vLLM 같은 추론 엔진을 여러 개 띄우고, 요청마다 어느 replica로 보낼지 결정하는 계층이다. 추론 엔진을 대체하지 않고 그 앞에 붙는다.

이 핸즈온은 llm-d를 처음 켜 보고 EPP의 라우팅 결정을 눈으로 확인하는 데까지를 다룬다. GPU가 없는 맥과 GPU가 1장인 노드, 두 환경을 모두 준비했다.

## 문서

| 문서 | 내용 |
|---|---|
| [1-architecture.md](./docs/1-architecture.md) | llm-d 구성요소, 요청 흐름, scorer가 보는 것 |
| [2-setup-kind-mac.md](./docs/2-setup-kind-mac.md) | 실습환경 1. 맥 kind 클러스터 + inference simulator |
| [3-setup-gpu-node.md](./docs/3-setup-gpu-node.md) | 실습환경 2. GPU 1장짜리 노드 + kind + 실제 vLLM |
| [4-routing.md](./docs/4-routing.md) | 라우팅 동작 관찰. 어느 pod으로 갔는지 세어 본다 |

manifest와 helm values는 [manifests/](./manifests/README.md)에 있고, 고정한 버전도 거기 정리해 뒀다.

## 두 환경을 나눈 이유

| | 맥 kind | GPU 노드 |
|---|---|---|
| model server | llm-d-inference-sim | vLLM |
| replica | 4개 | 2개 (GPU 1장을 time-slicing) |
| 볼 수 있는 것 | 라우팅 결정, scorer 동작 | 실제 추론, GPU 메모리 점유 |
| 볼 수 없는 것 | 실제 추론 품질과 처리량 | replica를 늘린 라우팅 분포 |

- 라우팅 자체를 이해하는 데는 GPU가 필요 없다. simulator가 vLLM의 OpenAI API와 Prometheus 메트릭을 그대로 흉내 내므로 EPP 입장에서는 구분되지 않는다.
- GPU가 1장이면 replica를 여러 개 만들 방법이 time-slicing뿐이고, 그때 메모리는 나뉘지 않는다는 제약이 따라온다. 그 부분은 [3-setup-gpu-node.md](./docs/3-setup-gpu-node.md)에 정리했다.

## 시작 순서

1. [1-architecture.md](./docs/1-architecture.md)로 구성요소를 먼저 본다. 설치 명령이 무엇을 만드는지 알고 시작하는 편이 낫다.
2. 가진 장비에 맞는 setup 문서로 환경을 만든다.
3. [4-routing.md](./docs/4-routing.md)로 라우팅을 관찰한다.

## 참고자료

- llm-d 공식 quickstart: <https://llm-d.ai/docs/guide/Installation/quickstart>
- llm-d well-lit path 가이드: <https://github.com/llm-d/llm-d/tree/main/guides>
- llm-d-inference-sim: <https://github.com/llm-d/llm-d-inference-sim>
- Gateway API Inference Extension: <https://github.com/kubernetes-sigs/gateway-api-inference-extension>
