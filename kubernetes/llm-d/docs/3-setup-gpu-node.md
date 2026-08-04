# 실습환경 2 - GPU 1장짜리 노드

NVIDIA GPU가 1장 달린 Linux 노드에서 실제 vLLM을 띄운다. 클러스터는 맥과 똑같이 kind로 만든다. 관리형 클러스터를 빌리지 않고 노드 한 대로 끝내기 위해서다.

- 이 환경에서 확인할 수 있는 것: 실제 추론 응답, GPU 메모리 점유, vLLM 메트릭 기반 scorer 동작
- GPU가 1장이므로 replica 2개가 같은 GPU를 나눠 쓴다. time-slicing으로 나눈다.

명령은 모두 `kubernetes/llm-d/`에서 실행한다.

## 사전 준비

- NVIDIA 드라이버가 설치되어 `nvidia-smi`가 동작하는 Linux 노드
- docker, [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- kind v0.32.0, kubectl, helm v3
- GPU 메모리 16GB 이상 권장. Qwen3-0.6B 기준으로 replica 2개가 각각 35%를 잡는다.

## GPU를 kind 노드에 넣기

kind 노드는 컨테이너다. 그 컨테이너 안에서 GPU가 보이려면 docker의 기본 런타임이 nvidia여야 한다.

```bash
sudo nvidia-ctk runtime configure --runtime=docker --set-as-default
sudo systemctl restart docker
```

device plugin이 GPU를 pod에 붙이는 방식을 volume mount로 바꾼다. kind 노드 안의 containerd는 nvidia 런타임을 모르기 때문에 환경변수 방식이 동작하지 않는다.

```bash
sudo nvidia-ctk config --set accept-nvidia-visible-devices-as-volume-mounts=true --in-place
sudo systemctl restart docker
```

이 두 설정이 kind에서 GPU를 쓰는 핵심이다. 호스트 docker가 kind 노드 컨테이너에 드라이버와 `/dev/nvidia*`를 넣어 주고, 노드 안의 pod은 device plugin이 만든 volume mount로 그것을 물려받는다.

## up

kind 클러스터를 만든다. 노드가 컨테이너 하나이므로 GPU도 하나다.

```bash
kind create cluster --config manifests/kind/kind-gpu-node.yaml
```

kind 노드 안에서 GPU가 보이는지 먼저 확인한다. 여기서 안 보이면 다음 단계는 전부 실패한다.

```bash
docker exec -it llm-d-gpu-control-plane nvidia-smi
```

NVIDIA device plugin을 time-slicing 설정과 함께 설치한다.

```bash
helm repo add nvdp https://nvidia.github.io/k8s-device-plugin
helm repo update
helm upgrade -i nvdp nvdp/nvidia-device-plugin \
  --namespace nvidia-device-plugin --create-namespace \
  --version 0.19.3 \
  --set deviceListStrategy=volume-mounts \
  --set config.default=default \
  --set-file config.map.default=manifests/gpu/time-slicing-config.yaml
```

노드가 GPU를 4개로 광고하는지 확인한다. 물리 GPU는 1장이지만 `nvidia.com/gpu: 4`로 보이면 성공이다.

```bash
kubectl get node -o jsonpath='{.items[0].status.capacity.nvidia\.com/gpu}'
```

여기부터는 맥 환경과 같다. CRD, namespace, router를 설치한다.

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api-inference-extension/releases/download/v1.5.0/v1-manifests.yaml
kubectl create namespace llm-d
helm install quickstart oci://ghcr.io/llm-d/charts/llm-d-router-standalone \
  --version v0.9.0 \
  -f manifests/router/router.values.yaml \
  -n llm-d
```

vLLM model server를 배포한다.

```bash
kubectl apply -f manifests/gpu/vllm-deployment.yaml -n llm-d
```

모델 다운로드와 CUDA graph capture 때문에 첫 기동은 몇 분 걸린다.

```bash
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=vllm-decode -n llm-d --timeout=1200s
```

## 확인

GPU 메모리를 두 pod이 나눠 쓰고 있는지 본다.

```bash
docker exec -it llm-d-gpu-control-plane nvidia-smi
```

요청을 보낸다. sim과 달리 진짜 생성 결과가 온다.

```bash
kubectl port-forward -n llm-d svc/quickstart-epp 8080:80
curl -s http://localhost:8080/v1/completions \
  -H 'Content-Type: application/json' \
  -d '{"model": "Qwen/Qwen3-0.6B", "prompt": "쿠버네티스가 무엇인지 한 문장으로 설명해줘.", "max_tokens": 100}' | jq
```

## time-slicing이 나누지 않는 것

- time-slicing은 GPU 시간만 나눈다. 메모리는 나누지 않는다. 두 pod이 같은 GPU 메모리를 그냥 같이 쓴다.
- 그래서 [vllm-deployment.yaml](../manifests/gpu/vllm-deployment.yaml)에서 `--gpu-memory-utilization=0.35`를 준다. vLLM은 기본값 0.9로 KV cache를 미리 잡으므로, 이 값을 안 낮추면 먼저 뜬 pod이 GPU를 다 먹고 두 번째 pod은 CUDA OOM으로 죽는다.
- 격리도 없다. 한 pod이 GPU를 오래 점유하면 다른 pod의 지연이 그대로 늘어난다. 프로덕션에서 격리가 필요하면 MIG나 물리적 분리를 쓴다.
- 실습에서 이 방식을 고른 이유는 GPU 1장으로 replica를 2개 이상 만들어야 라우팅 동작을 볼 수 있기 때문이다. replica가 1개면 EPP가 고를 대상이 없다.

## 자주 막히는 지점

- pod이 Pending이고 이벤트에 `Insufficient nvidia.com/gpu`가 뜨면 device plugin이 GPU를 못 찾은 것이다. `kubectl logs -n nvidia-device-plugin -l app.kubernetes.io/name=nvidia-device-plugin`을 본다.
- pod은 떴는데 컨테이너 안에서 `nvidia-smi`가 없으면 `accept-nvidia-visible-devices-as-volume-mounts` 설정이 빠졌거나 docker를 재시작하지 않은 것이다.
- 두 번째 replica만 CUDA OOM으로 죽으면 `--gpu-memory-utilization` 값을 더 낮춘다.
- gated 모델을 쓰려면 `llm-d-hf-token` secret을 만들고 Deployment에 `HF_TOKEN` 환경변수를 추가한다. Qwen3-0.6B는 공개 모델이라 필요 없다.

## down

클러스터째 지운다. device plugin과 nvidia 런타임 설정은 호스트에 남으므로 다음 실습에서 다시 쓸 수 있다.

```bash
kind delete cluster --name llm-d-gpu
```
