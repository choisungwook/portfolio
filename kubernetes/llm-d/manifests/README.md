# llm-d quickstart manifests

llm-d quickstart 핸즈온에서 사용하는 파일이다. 사용 순서와 명령어는 [docs/](../docs/)에 있다.

## 인덱스

| 디렉터리/파일 | 설명 |
|---|---|
| `kind/kind-mac.yaml` | 맥 실습용 kind 클러스터 정의. control-plane 1개 + worker 2개 |
| `kind/kind-gpu-node.yaml` | GPU 노드 실습용 kind 클러스터 정의. 단일 노드 |
| `router/router.values.yaml` | llm-d-router-standalone helm chart values. EPP 플러그인 구성과 InferencePool selector |
| `sim/vllm-sim-deployment.yaml` | llm-d-inference-sim model server 4 replica. GPU 없이 라우팅만 관찰할 때 사용 |
| `gpu/vllm-deployment.yaml` | vLLM model server 2 replica. GPU 1장을 time-slicing으로 나눠 쓴다 |
| `gpu/time-slicing-config.yaml` | NVIDIA device plugin의 time-slicing 설정. Kubernetes 리소스가 아니라 helm에 넘기는 설정 파일 |

## 고정한 버전

| 대상 | 버전 |
|---|---|
| llm-d guide | v0.8.1 |
| llm-d-router-standalone chart, EPP 이미지 | v0.9.0 |
| Gateway API Inference Extension CRD | v1.5.0 |
| llm-d-inference-sim | v0.10.2 |
| vLLM | v0.23.0 |
| kind, kind node 이미지 | v0.32.0, v1.36.1 |
| NVIDIA device plugin | v0.19.3 |
