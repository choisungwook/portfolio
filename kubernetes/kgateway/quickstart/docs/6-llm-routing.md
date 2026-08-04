# LLM 백엔드를 kgateway 뒤에 두기

OpenAI 호환 API를 내는 백엔드를 kgateway 뒤에 놓고, 생성 요청에 맞게 timeout과 retry를 조정한다.

환경은 둘 중 하나를 고른다. 라우팅 쪽 리소스는 두 환경이 완전히 같고 백엔드 Deployment만 다르다.

| 트랙 | 환경 | 백엔드 | 접속 |
|---|---|---|---|
| A | 맥 kind ([2-setup.md](2-setup.md)) | 시뮬레이터. GPU 불필요 | `http://localhost:8080` |
| B | GPU 노드 ([5-setup.md](5-setup.md)) | vLLM. GPU 1장 점유 | `http://<노드 IP>:30080` |

아래 명령은 Track A 기준으로 적는다. Track B는 주소만 바꾼다.

## namespace와 service

service의 selector는 `app: vllm`이다. 두 트랙의 Deployment가 같은 label을 달고 있어서, service와 HTTPRoute는 어느 쪽이 떠 있든 그대로 동작한다.

```bash
kubectl apply -f manifests/llm/llm-namespace.yaml
kubectl apply -f manifests/llm/vllm-service.yaml
```

## 백엔드 배포

Track A는 시뮬레이터를 쓴다. 실제로 모델을 로드하지 않고 OpenAI API 모양의 응답만 만들어 준다. 라우팅과 정책을 확인하는 데는 이걸로 충분하고 GPU가 필요 없다.

```bash
kubectl apply -f manifests/llm/vllm-sim-deployment.yaml
```

Track B는 vLLM을 띄운다. `nvidia.com/gpu: 1`을 requests와 limits에 같이 적는다. GPU는 나눠 쓸 수 없어서 두 값이 항상 같아야 하고, 그래서 replica도 1이다.

```bash
kubectl apply -f manifests/llm/vllm-gpu-deployment.yaml
```

```bash
kubectl get pods -n llm -w
```

vLLM은 모델을 내려받고 올리는 데 몇 분이 걸린다. 그동안 `/health`가 200을 주지 않으므로 `startupProbe`의 `failureThreshold`를 크게 잡아 뒀다. 이걸 짧게 두면 파드가 준비되기 전에 죽고 다시 처음부터 모델을 받는 무한 재시작에 빠진다.

## HTTPRoute

[vllm-httproute.yaml](../manifests/llm/vllm-httproute.yaml)은 `llm.example.com`의 `/v1` prefix만 백엔드로 보낸다. OpenAI 호환 API가 전부 `/v1` 아래에 있어서, 이렇게 잘라 두면 `/metrics` 같은 것이 gateway 밖으로 새지 않는다.

```bash
kubectl apply -f manifests/llm/vllm-httproute.yaml
```

```bash
kubectl get httproute vllm -n llm -o yaml
```

## 호출

모델 이름은 백엔드에 올린 것과 같아야 한다. 두 트랙 모두 `Qwen/Qwen2.5-0.5B-Instruct`로 맞춰 뒀다.

```bash
curl -s http://localhost:8080/v1/completions \
  -H "host: llm.example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-0.5B-Instruct",
    "prompt": "kubernetes gateway API를 한 문장으로 설명하면",
    "max_tokens": 64
  }'
```

어떤 모델이 붙어 있는지는 `/v1/models`로 확인한다.

```bash
curl -s http://localhost:8080/v1/models -H "host: llm.example.com"
```

## 생성 트래픽에 맞춘 timeout과 retry

여기가 일반 API와 갈리는 지점이다.

- 응답이 초 단위로 안 끝난다. 프록시의 기본 timeout은 짧아서 긴 생성이 중간에 잘린다.
- 잘려도 클라이언트에는 연결이 끊긴 것처럼만 보인다. 백엔드는 GPU를 계속 쓰고 있는데 응답을 받을 사람이 없다.
- 그래서 재시도가 위험하다. 실패로 보이는 요청이 사실은 진행 중일 수 있고, 재시도는 GPU 작업을 하나 더 만든다.

[vllm-trafficpolicy.yaml](../manifests/llm/vllm-trafficpolicy.yaml)은 이 셋을 반영한다. `request`를 넉넉히 주고, `streamIdle`로 "토큰이 한동안 안 나오면 끊는다"를 따로 잡고, `attempts`는 2로 억제한다.

```bash
kubectl apply -f manifests/llm/vllm-trafficpolicy.yaml
```

`max_tokens`를 크게 줘서 응답이 오래 걸리게 만들면 timeout이 늘어난 것을 확인할 수 있다.

```bash
time curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/v1/completions \
  -H "host: llm.example.com" \
  -H "Content-Type: application/json" \
  -d '{"model": "Qwen/Qwen2.5-0.5B-Instruct", "prompt": "long story:", "max_tokens": 512}'
```

## 여기서 멈추는 이유

이 구성은 백엔드를 "HTTP 서버 여럿" 이상으로 보지 않는다. 요청을 어디로 보낼지 고를 때 KV 캐시 적중이나 GPU 메모리 사용률 같은 것을 보지 않는다는 뜻이고, GPU가 여러 장이 되면 그 차이가 처리량으로 나타난다.

모델을 아는 라우팅은 Gateway API Inference Extension의 InferencePool이 담당한다. 다만 kgateway의 Envoy data plane은 v2.1에서 이 기능을 deprecated했고 v2.4.2 chart에는 흔적이 없다([1-why-kgateway.md](1-why-kgateway.md)). 지금 이 조합을 하려면 agentgateway data plane을 따로 올려야 하므로, kgateway quickstart의 범위 밖으로 둔다.

GPU가 한 장인 이 실습 환경에서는 어차피 고를 대상이 하나뿐이라 얻는 것도 없다.

## 다음

[7-cleanup.md](7-cleanup.md)로 정리한다.
