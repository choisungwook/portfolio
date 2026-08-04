# Manifests

kgateway quickstart에서 apply하는 리소스다. 적용 순서와 확인 방법은 [../docs/](../docs/)에 있다.

| 디렉터리/파일 | 설명 |
|---|---|
| `kind/kind-config.yaml` | 단일 노드 kind cluster. NodePort 30080을 맥 localhost:8080으로 노출 |
| `gateway/gateway-parameters.yaml` | gateway proxy service를 NodePort 30080으로 고정하는 GatewayParameters |
| `gateway/http-gateway.yaml` | 8080 HTTP listener 하나를 가진 Gateway |
| `routing/httpbin-httproute.yaml` | httpbin.example.com을 httpbin service로 보내는 HTTPRoute |
| `routing/httpbin-v2-deployment.yaml` | 가중치 분배 대상이 되는 두 번째 httpbin |
| `routing/httpbin-v2-service.yaml` | httpbin-v2 service |
| `routing/httpbin-split-httproute.yaml` | v1 80% v2 20% 가중치 분배와 backendRef별 응답 헤더 |
| `policy/httpbin-ratelimit-trafficpolicy.yaml` | 30초당 3건 local rate limit TrafficPolicy |
| `policy/httpbin-transformation-trafficpolicy.yaml` | 요청/응답 헤더를 바꾸는 transformation TrafficPolicy |
| `llm/llm-namespace.yaml` | LLM 백엔드용 namespace |
| `llm/vllm-sim-deployment.yaml` | GPU 없이 OpenAI API를 흉내내는 시뮬레이터. 맥 kind 트랙 |
| `llm/vllm-gpu-deployment.yaml` | GPU 1장을 점유하는 vLLM. GPU 노드 트랙 |
| `llm/vllm-service.yaml` | 두 트랙이 공유하는 service. selector는 `app: vllm` |
| `llm/vllm-httproute.yaml` | llm.example.com/v1을 vllm service로 보내는 HTTPRoute |
| `llm/vllm-trafficpolicy.yaml` | 생성 요청에 맞춘 timeout과 retry TrafficPolicy |
