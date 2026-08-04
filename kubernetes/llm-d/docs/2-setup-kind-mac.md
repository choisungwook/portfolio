# 실습환경 1 - 맥 kind 클러스터 (GPU 없음)

맥에는 CUDA GPU가 없다. vLLM 대신 [llm-d-inference-sim](https://github.com/llm-d/llm-d-inference-sim)을 model server 자리에 넣는다. OpenAI 호환 API와 vLLM Prometheus 메트릭을 그대로 흉내 내므로 EPP 입장에서는 vLLM과 구분되지 않는다.

- 이 환경에서 확인할 수 있는 것: InferencePool, EPP scorer, 라우팅 결정
- 확인할 수 없는 것: 실제 추론 품질, 토큰 처리량, GPU 메모리

명령은 모두 `kubernetes/llm-d/`에서 실행한다.

## 사전 준비

- Docker Desktop 또는 colima. CPU 4개, 메모리 8GB 이상을 컨테이너 런타임에 할당한다.
- kind v0.32.0, kubectl, helm v3, jq

homebrew로 클라이언트 도구를 설치한다.

```bash
brew install kind kubectl helm jq
```

## up

kind 클러스터를 만든다. worker 2개를 두는 이유는 model server replica가 노드에 흩어지는 것을 보기 위해서다.

```bash
kind create cluster --config manifests/kind/kind-mac.yaml
```

llm-d가 쓰는 InferencePool CRD를 설치한다. Gateway API Inference Extension 프로젝트가 배포한다.

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api-inference-extension/releases/download/v1.5.0/v1-manifests.yaml
```

namespace를 만든다.

```bash
kubectl create namespace llm-d
```

router를 설치한다. EPP와 Envoy sidecar, InferencePool이 함께 만들어진다.

```bash
helm install quickstart oci://ghcr.io/llm-d/charts/llm-d-router-standalone \
  --version v0.9.0 \
  -f manifests/router/router.values.yaml \
  -n llm-d
```

model server를 배포한다.

```bash
kubectl apply -f manifests/sim/vllm-sim-deployment.yaml -n llm-d
```

pod이 모두 Ready가 될 때까지 기다린다. sim은 모델 가중치를 받지 않으므로 십여 초면 끝난다.

```bash
kubectl wait --for=condition=Ready pod --all -n llm-d --timeout=300s
```

## 확인

InferencePool이 pod 4개를 잡았는지 본다.

```bash
kubectl get inferencepool quickstart -n llm-d -o yaml
kubectl get pod -n llm-d -l llm-d.ai/inference-serving=true -o wide
```

EPP service를 로컬로 연결한다.

```bash
kubectl port-forward -n llm-d svc/quickstart-epp 8080:80
```

다른 터미널에서 요청을 보낸다. 응답이 오면 client에서 EPP를 거쳐 sim까지 경로가 이어진 것이다.

```bash
curl -s http://localhost:8080/v1/completions \
  -H 'Content-Type: application/json' \
  -d '{"model": "Qwen/Qwen3-0.6B", "prompt": "llm-d quickstart", "max_tokens": 20}' | jq
```

## 자주 막히는 지점

- pod이 Pending에서 안 움직이면 EPP의 resource requests 때문이다. upstream 기본값은 CPU 4개, 메모리 8Gi다. [router.values.yaml](../manifests/router/router.values.yaml)에서 줄여 뒀지만 컨테이너 런타임 할당량이 더 작으면 여전히 안 뜬다.
- EPP 로그에 pod을 못 찾는다는 메시지가 나오면 label을 확인한다. InferencePool의 `selector.matchLabels`와 Deployment `template.metadata.labels`가 둘 다 `llm-d.ai/inference-serving: "true"`여야 한다. Deployment 최상단 label만 붙이면 안 잡힌다.
- sim이 CrashLoopBackOff면 HuggingFace에서 tokenizer를 못 받은 경우다. `--model`에 실재하지 않는 이름(예: `dummy-model`)을 주면 내장 정규식 tokenizer를 쓰므로 네트워크 없이 뜬다. 대신 요청 body의 `model` 값도 같이 바꾼다.

## down

실습이 끝나면 클러스터째 지운다.

```bash
kind delete cluster --name llm-d
```
