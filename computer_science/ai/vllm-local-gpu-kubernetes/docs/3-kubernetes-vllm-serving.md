# k3s에서 vLLM Pod를 실행하고 API를 검증하는 방법

## TL;DR

k3s에서는 NVIDIA runtime, NVIDIA device plugin, vLLM Deployment가 순서대로 맞아야 합니다. Pod가 `runtimeClassName: nvidia`와 `nvidia.com/gpu: 1`을 요청하고, `/health`와 `/v1/chat/completions` 호출이 통과하면 기본 경로를 확인한 것입니다.

## 왜 device plugin이 필요할까

Kubernetes 스케줄러는 기본적으로 GPU가 몇 개인지 모릅니다. NVIDIA device plugin이 node의 GPU를 `nvidia.com/gpu` 리소스로 등록해야 Pod가 GPU를 요청할 수 있습니다.

그럼 NVIDIA runtime만 있으면 충분할까요? 충분하지 않습니다. runtime은 컨테이너 안에 GPU 장치를 넣는 역할에 가깝고, device plugin은 Kubernetes가 스케줄링 가능한 GPU 리소스를 알게 하는 역할에 가깝습니다. **vLLM Pod가 뜨려면 두 조건이 같이 필요합니다.**

## NVIDIA device plugin을 어떻게 설치할까

NVIDIA device plugin DaemonSet을 설치합니다.

```bash
make k3s-device-plugin
```

device plugin Pod 상태를 확인합니다.

```bash
kubectl -n kube-system get pods -l name=nvidia-device-plugin-ds
```

node에 GPU 리소스가 잡혔는지 확인합니다.

```bash
kubectl describe node | grep -A5 "nvidia.com/gpu"
```

이 값이 보이지 않으면 vLLM Deployment를 적용해도 `Insufficient nvidia.com/gpu` 또는 runtime 관련 오류가 날 수 있습니다.

## vLLM manifest는 무엇을 담고 있을까

이 핸즈온의 manifest는 `manifests/k3s`에 있습니다.

```text
manifests/k3s/
├── deployment.yaml
├── kustomization.yaml
├── namespace.yaml
├── pvc.yaml
└── service.yaml
```

중요한 부분은 Deployment입니다.

```yaml
runtimeClassName: nvidia
containers:
  - name: vllm
    image: vllm/vllm-openai:latest
    args:
      - --model
      - Qwen/Qwen3-0.6B
    resources:
      limits:
        nvidia.com/gpu: "1"
```

`runtimeClassName: nvidia`는 k3s가 감지한 NVIDIA runtime을 명시적으로 사용하게 합니다. `nvidia.com/gpu: "1"`은 device plugin이 등록한 GPU 하나를 요청합니다.

## 어떻게 배포할까

manifest를 적용합니다.

```bash
make k3s-apply
```

Deployment rollout을 기다립니다.

```bash
make k3s-wait
```

로그를 확인합니다.

```bash
make k3s-logs
```

모델 다운로드 때문에 첫 시작은 시간이 걸릴 수 있습니다. `Application startup complete` 로그가 보이면 API 서버가 열린 상태입니다.

## API는 어떻게 검증할까

로컬에서 접근하기 위해 port-forward를 엽니다.

```bash
make k3s-port-forward
```

다른 터미널에서 health endpoint를 확인합니다.

```bash
curl -fsS http://localhost:8000/health
```

OpenAI 호환 chat completions API를 호출합니다.

```bash
curl -fsS http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen3-0.6B",
    "messages": [
      {
        "role": "user",
        "content": "vLLM을 한 문장으로 설명해줘"
      }
    ],
    "max_tokens": 64
  }'
```

응답 JSON에 `choices`가 있으면 기본 검증은 통과입니다.

## 토큰이 필요한 모델은 어떻게 다룰까

gated model을 쓰면 Hugging Face token이 필요할 수 있습니다. 이 저장소에는 토큰을 넣지 않습니다.

현재 셸의 `HF_TOKEN`으로 Kubernetes Secret을 만듭니다.

```bash
kubectl -n vllm-local create secret generic hf-token-secret \
  --from-literal=token="$HF_TOKEN" \
  --dry-run=client \
  -o yaml | kubectl apply -f -
```

그리고 Deployment에 `HF_TOKEN` 환경변수를 추가합니다. 공개 모델 실습에서는 이 단계를 생략합니다.

장점은 토큰이 Git에 남지 않는다는 점입니다. 단점은 클러스터 Secret은 여전히 운영자가 접근할 수 있으므로, 실제 운영에서는 Secret 관리 체계를 따로 잡아야 한다는 점입니다.

## 문제가 생기면 어디부터 볼까

Pod가 `Pending`이면 GPU 리소스 등록을 먼저 봅니다.

```bash
kubectl describe pod -n vllm-local -l app.kubernetes.io/name=vllm
kubectl describe node | grep -A5 "nvidia.com/gpu"
```

Pod가 시작되지만 vLLM이 죽으면 로그를 봅니다.

```bash
kubectl -n vllm-local logs deployment/vllm-server
```

메모리 부족이면 더 작은 모델을 쓰거나 `--max-model-len`을 줄입니다. 정확한 GPU별 한계값은 확인 필요입니다.

## 정리하면 무엇을 확인한 걸까

정리하면, k3s vLLM 실습은 "Kubernetes에 YAML을 적용했다"보다 "GPU runtime, device plugin, Pod resource request, OpenAI 호환 API 호출이 한 줄로 이어졌다"를 확인하는 작업입니다. 이 흐름이 보이면 EKS나 GPU node pool로 옮길 때도 어느 레이어에서 문제가 나는지 나눠 볼 수 있습니다.

## 참고자료

- [vLLM Kubernetes deployment](https://docs.vllm.ai/en/latest/deployment/k8s/)
- [K3s NVIDIA Container Runtime support](https://docs.k3s.io/advanced#nvidia-container-runtime-support)
- [NVIDIA Kubernetes device plugin](https://github.com/NVIDIA/k8s-device-plugin)
