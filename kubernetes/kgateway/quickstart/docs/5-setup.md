# 실습 환경 준비: GPU 노드 한 대

Track B의 환경이다. GPU가 달린 노드 한 대에 Kubernetes를 올리고 kgateway까지 설치한다. [6-llm-routing.md](6-llm-routing.md)가 이 환경을 전제로 한다.

Track A의 kind cluster만으로도 [6-llm-routing.md](6-llm-routing.md)를 끝까지 할 수 있다. 그때는 vLLM 대신 시뮬레이터를 쓴다. 진짜 GPU 추론까지 보고 싶을 때만 이 문서가 필요하다.

## 전제

- GPU 한 장이 달린 리눅스 노드 한 대. control plane과 worker를 겸한다
- NVIDIA 드라이버가 이미 설치돼 있고 `nvidia-smi`가 GPU를 보여준다
- 이 노드에서 kubectl과 helm을 쓸 수 있다

kind를 쓰지 않는다. 컨테이너 안의 컨테이너로 GPU를 넘기려면 런타임 설정을 두 겹으로 맞춰야 하는데, 노드가 어차피 한 대라 kind가 주는 이점이 없다.

## 단일 노드 cluster

k3s가 가장 짧다. 설치가 끝나면 kubeconfig가 `/etc/rancher/k3s/k3s.yaml`에 생긴다.

```bash
curl -sfL https://get.k3s.io | sh -
```

노드가 한 대이므로 control plane에 워크로드가 올라가야 한다. k3s는 기본으로 taint를 걸지 않지만, kubeadm으로 만든 cluster라면 taint를 지운다.

```bash
kubectl taint nodes --all node-role.kubernetes.io/control-plane- || true
```

## GPU를 파드에 노출

컨테이너 런타임이 GPU를 넘길 수 있어야 하고, device plugin이 그것을 `nvidia.com/gpu` 자원으로 광고해야 한다. 둘 중 하나만 있으면 파드는 Pending에서 멈춘다.

- 드라이버와 컨테이너 툴킷이 이미 있으면 device plugin만 넣는다
- 드라이버부터 자동으로 맞추려면 NVIDIA GPU Operator를 쓴다. 노드 한 대에는 과할 수 있다

device plugin만 넣는 쪽은 DaemonSet 하나다.

```bash
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.19.3/deployments/static/nvidia-device-plugin.yml
```

노드 allocatable에 `nvidia.com/gpu: 1`이 보여야 다음으로 넘어갈 수 있다.

```bash
kubectl get node -o jsonpath='{.items[0].status.allocatable}' | tr ',' '\n' | grep nvidia
```

## kgateway 설치

Track A와 완전히 같다. Gateway API CRD를 먼저 넣고 kgateway chart 두 개를 순서대로 설치한다.

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

```bash
helm upgrade -i kgateway-crds oci://cr.kgateway.dev/kgateway-dev/charts/kgateway-crds \
  --create-namespace --namespace kgateway-system --version v2.4.2
helm upgrade -i kgateway oci://cr.kgateway.dev/kgateway-dev/charts/kgateway \
  --namespace kgateway-system --version v2.4.2
```

Gateway와 GatewayParameters도 같은 파일을 쓴다. NodePort 30080으로 고정돼 있으므로 노드 IP의 30080으로 붙는다. kind에서 쓰던 localhost:8080이 여기서는 `<노드 IP>:30080`이 된다.

```bash
kubectl apply -f manifests/gateway/gateway-parameters.yaml
kubectl apply -f manifests/gateway/http-gateway.yaml
```

```bash
kubectl get gateway -n kgateway-system
```

## 다음

LLM 백엔드를 붙이는 [6-llm-routing.md](6-llm-routing.md)로 넘어간다.
