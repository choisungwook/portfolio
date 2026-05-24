# K3s NVIDIA GPU 부트스트랩

## 목적

- Ubuntu 24.04 LTS host에 single-node K3s를 설치하고 NVIDIA GPU를 Pod에 노출한다.

<!-- akbun-writing: K3s GPU 설정을 처음 하며 막혔던 지점 추가 -->

## 환경

| 항목 | 값 |
|---|---|
| OS | Ubuntu 24.04 LTS |
| GPU | NVIDIA RTX 5060 16GB 이상 |
| Cluster | K3s native single-node |
| GPU 구성 | NVIDIA Container Toolkit + NVIDIA device plugin |

## Single-node 판단

K3s single-node는 이 실습에 지장이 없다. K3s server node는 control-plane과 datastore를 담당하면서도 kubelet, container runtime, CNI를 함께 실행한다. 따라서 별도 worker node 없이 JupyterHub, fine-tuning Job, inference Pod를 배치할 수 있다.

장점:

- Ubuntu host가 곧 Kubernetes node라서 K3s containerd가 NVIDIA runtime을 직접 사용한다.
- kind처럼 Docker container 안에 Kubernetes node를 만들고 GPU를 다시 전달하는 계층이 없다.
- JupyterHub, Job, inference API를 오래 띄워두는 GPU 서버 실습에 맞다.

단점:

- cluster 생성과 삭제가 host systemd service에 영향을 준다.
- GPU가 1개이면 GPU Pod를 동시에 여러 개 실행하기 어렵다.
- JupyterHub single-user server, fine-tuning Job, inference API는 GPU를 순서대로 점유하도록 운영해야 한다.

## 사전 준비

- NVIDIA driver 설치
- Docker 설치
- kubectl 설치
- helm 설치

## 단계

1. Host GPU를 확인한다.

```sh
nvidia-smi
```

`NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver`가 나오면 Kubernetes를 보기 전에 host driver를 먼저 고친다.

```sh
uname -r
dkms status | grep -i nvidia
sudo modprobe nvidia
```

확인 포인트:

- 현재 kernel용 NVIDIA DKMS module이 있어야 한다.
- `linux-headers-$(uname -r)`가 설치되어 있어야 한다.
- `nvidia-smi`가 host에서 먼저 성공해야 한다.

2. NVIDIA Container Toolkit repository를 추가한다.

```sh
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update
sudo apt install -y nvidia-container-toolkit
```

3. Docker에서 GPU가 보이는지 확인한다.

```sh
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu24.04 nvidia-smi
```

4. K3s를 설치한다.

K3s 기본 빠른 설치 명령은 설치와 server 시작을 같이 실행한다. 이 실습에서는 설치와 시작을 단계별로 확인하기 위해 K3s service를 설치만 하고 아직 시작하지 않는다.

```sh
curl -sfL https://get.k3s.io | INSTALL_K3S_SKIP_START=true sh -
```

5. K3s server를 시작한다.

```sh
sudo systemctl start k3s
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
```

6. kubectl context를 설정한다.

```sh
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get nodes -o wide
```

7. K3s containerd가 NVIDIA runtime을 인식했는지 확인한다.

```sh
sudo grep nvidia /var/lib/rancher/k3s/agent/etc/containerd/config.toml
kubectl get runtimeclass nvidia
```

출력이 없으면 K3s를 재시작한다.

```sh
sudo systemctl restart k3s
sudo grep nvidia /var/lib/rancher/k3s/agent/etc/containerd/config.toml
kubectl get runtimeclass nvidia
```

8. Dynamic provisioning 기본 StorageClass를 확인한다.

```sh
kubectl get storageclass local-path
kubectl -n kube-system get deployment local-path-provisioner
```

K3s 기본 설정에서는 `local-path` StorageClass와 Local Path Provisioner가 설치된다. `local-storage` packaged component를 비활성화하면 이 기본 dynamic provisioning은 사용할 수 없다.

9. Single-node가 workload를 받을 수 있는지 taint를 확인한다.

```sh
kubectl describe node | grep -i '^Taints'
```

기대 결과:

- `Taints: <none>`

10. NVIDIA device plugin을 설치한다.

```sh
kubectl label node "$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')" \
  nvidia.com/gpu.present=true \
  --overwrite
helm repo add nvdp https://nvidia.github.io/k8s-device-plugin
helm repo update
helm upgrade --install nvidia-device-plugin nvdp/nvidia-device-plugin \
  --namespace nvidia \
  --create-namespace \
  --version 0.19.1 \
  --set runtimeClassName=nvidia
kubectl -n nvidia rollout status daemonset/nvidia-device-plugin --timeout=180s
```

Node label은 NVIDIA device plugin chart의 기본 node affinity를 만족시키기 위해 사용한다. `runtimeClassName=nvidia`는 device plugin Pod 자체가 GPU/NVML을 볼 수 있게 한다.

## 검증

Node에 GPU resource가 보이는지 확인한다.

```sh
kubectl get nodes -o jsonpath='{.items[*].status.allocatable.nvidia\.com/gpu}'; echo
```

기대 결과:

- `1` 이상 출력

GPU smoke test Pod를 실행한다.

```sh
kubectl apply -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata:
  name: gpu-smoke-test
spec:
  restartPolicy: Never
  runtimeClassName: nvidia
  containers:
    - name: cuda
      image: nvidia/cuda:12.8.1-base-ubuntu24.04
      command: ["nvidia-smi"]
      resources:
        limits:
          nvidia.com/gpu: 1
YAML
```

Pod 완료를 기다린다.

```sh
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/gpu-smoke-test --timeout=240s
```

Pod 로그를 확인한다.

```sh
kubectl logs pod/gpu-smoke-test
```

기대 결과:

- Pod 안에서 RTX GPU가 출력

Smoke test Pod를 삭제한다.

```sh
kubectl delete pod gpu-smoke-test
```

## 정리

K3s를 삭제한다.

```sh
sudo /usr/local/bin/k3s-uninstall.sh
```

## 참고자료

- K3s architecture: https://docs.k3s.io/architecture
- K3s NVIDIA runtime: https://docs.k3s.io/advanced
- NVIDIA Container Toolkit install guide: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
- NVIDIA device plugin: https://github.com/NVIDIA/k8s-device-plugin
- Kubernetes GPU scheduling: https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/
