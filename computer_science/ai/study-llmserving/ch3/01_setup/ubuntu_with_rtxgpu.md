# Ubuntu 24.04와 RTX 5060 환경 준비

## 대상

- Ubuntu 24.04 LTS
- NVIDIA RTX 5060
- Python 3.13
- CUDA 12.8 계열 PyTorch
- Kubernetes 실습은 k3s 사용

## NVIDIA 드라이버

드라이버를 설치하고 재부팅한다.

```bash
sudo apt update
sudo apt install -y nvidia-driver-570 build-essential curl
sudo reboot
```

GPU와 드라이버를 확인한다.

```bash
nvidia-smi
```

## uv와 Python 환경

uv를 설치한다.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

shell에 다른 가상환경이 활성화되어 있으면 먼저 해제한다.

```bash
deactivate
```

프로젝트 루트에서 Python 3.13과 `.venv`를 생성하고 CUDA 의존성을 설치한다.

```bash
uv python install 3.13
uv venv --python 3.13
source .venv/bin/activate
uv sync --dev --extra gpu
python --version
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_capability())"
```

`VIRTUAL_ENV does not match the project environment path .venv` 경고는 다른 가상환경이 활성화된 상태라는 의미다. `--active`를 사용하지 않고 기존 환경을 해제한 뒤 프로젝트 `.venv`를 활성화한다.

정상 결과의 핵심 값은 `True`와 `(12, 0)`이다.

## Docker와 NVIDIA Container Toolkit

Docker를 설치한다.

```bash
sudo apt install -y docker.io
sudo usermod -aG docker "$USER"
newgrp docker
```

NVIDIA Container Toolkit을 설치한다.

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update
sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

컨테이너의 GPU 접근을 확인한다.

```bash
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
```

## k3s 클러스터

k3s를 설치한다.

```bash
curl -sfL https://get.k3s.io | sh -s - --write-kubeconfig-mode 644
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get nodes
```

NVIDIA device plugin을 설치한다.

```bash
kubectl create -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.17.0/deployments/static/nvidia-device-plugin.yml
kubectl -n kube-system rollout status ds/nvidia-device-plugin-daemonset
kubectl describe node | grep nvidia.com/gpu
```

로컬 이미지를 k3s containerd로 가져온다.

```bash
docker build -t ch03-serving:local .
docker save ch03-serving:local | sudo k3s ctr images import -
kubectl label node "$(kubectl get node -o jsonpath='{.items[0].metadata.name}')" role=serving --overwrite
```

k3s를 제거한다.

```bash
/usr/local/bin/k3s-uninstall.sh
```
