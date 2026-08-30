# Chapter 5-6 Ubuntu 환경 준비

## Up

### 요구사항

- 환경: Ubuntu 24.04 LTS
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB
- 확인된 driver: 595.71.05
- host CUDA compatibility: 13.2
- model runtime: CUDA 12.9 계열 vLLM image
- container runtime: Docker Engine + Compose plugin
- GPU 연결: NVIDIA Container Toolkit
- 여유 disk: 최소 40GB
- model download: 최초 1회 필요
- 결과 위치: `results/`
- 실행 위치: `computer_science/ai/study-llmserving/ch5-6`
- Kubernetes: 불필요
- Notebook: 불필요
- HTML: 미생성

여유 disk를 확인함.

```bash
df -h .
```

### 1. NVIDIA driver

권장 driver를 확인함.

```bash
sudo apt update
sudo apt install -y ubuntu-drivers-common
ubuntu-drivers devices
```

권장 driver를 설치하고 reboot함.

```bash
sudo ubuntu-drivers install
sudo reboot
```

host에서 GPU, driver, CUDA compatibility, VRAM을 확인함.

```bash
nvidia-smi
```

확인된 기준값임.

| 항목 | 값 |
| --- | --- |
| GPU | NVIDIA GeForce RTX 5060 Ti |
| VRAM | 16311MiB, nominal 16GB |
| Driver | 595.71.05 |
| CUDA compatibility | 13.2 |
| Power limit | 180W |

### 2. Docker Engine과 Compose

Docker 공식 APT repository key를 설치함.

```bash
sudo apt update
sudo apt install -y ca-certificates curl jq
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Ubuntu codename에 맞는 Docker repository를 추가함.

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
```

Docker Engine과 Compose plugin을 설치함.

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
```

설치를 확인함.

```bash
docker version
docker compose version
```

### 3. NVIDIA Container Toolkit

NVIDIA repository key와 source를 설치함.

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
```

Toolkit을 설치하고 Docker runtime을 구성함.

```bash
sudo apt update
sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

container가 GPU를 보는지 검증함.

```bash
docker run --rm --gpus all nvidia/cuda:12.9.1-base-ubuntu24.04 nvidia-smi
```

### 4. Compose GPU 연결 원리

Compose의 GPU 예약 설정임.

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

- Docker daemon: NVIDIA runtime 호출
- container: `/dev/nvidia*`와 driver library 접근
- CUDA library: image에 포함
- host driver: image CUDA보다 충분히 새 버전 필요
- host의 CUDA 13.2 표시는 driver compatibility 상한이며 container의 CUDA 12.9 runtime과 별개임
- `nvidia-smi` 성공 후 model 실행 실패: model format·kernel·VRAM 문제로 범위 축소 가능

### 5. Image와 관측 stack

vLLM 기반 공통 image를 build함.

```bash
docker compose --profile tools build benchmark
```

Prometheus, Grafana, DCGM Exporter를 기동함.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
docker compose ps
```

- Grafana: `http://127.0.0.1:3000`
- 기본 계정: `admin` / `admin`
- Prometheus: `http://127.0.0.1:9090`
- model endpoint: `http://127.0.0.1:8000`
- dashboard: `LLM serving / LLM Serving Chapter 5-6`
- 기본 bind: `0.0.0.0`, 같은 LAN에서도 접근 가능
- 로컬 전용 bind: 실행 전에 `export LAN_BIND_ADDRESS=127.0.0.1`
- 같은 Wi-Fi의 다른 기기에서 접속: [LAN endpoint 설정](./03-setup-lan-access.md)

### Compose profile

| Profile | 목적 | GPU |
| --- | --- | --- |
| `tools` | model load와 benchmark client | loader만 필요 |
| `bf16` | vLLM BF16 server | 필요 |
| `gptq` | vLLM GPTQ W4A16 server | 필요 |
| `fp8` | vLLM FP8 W8A8 server | 필요 |
| `observability` | Prometheus·Grafana·DCGM | DCGM만 필요 |

### Model cache

- volume: `llm-serving-ch5-6_hf-cache`
- 최초 실행: model download 발생
- 이후 실행: 동일 volume에서 재사용
- `docker compose down`: cache 유지
- `docker compose down -v`: cache 삭제

cache volume을 확인함.

```bash
docker volume ls | grep llm-serving-ch5-6
docker volume inspect llm-serving-ch5-6_hf-cache
```

## Down

container와 network만 종료함. model·Prometheus·Grafana volume은 유지함.

```bash
docker compose --profile "*" down --remove-orphans
```

model cache와 metric data까지 지울 때만 실행함. 재다운로드가 필요한 파괴적 정리임.

```bash
docker compose --profile "*" down -v --remove-orphans
```
