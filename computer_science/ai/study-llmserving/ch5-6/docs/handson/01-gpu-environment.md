# Host부터 Grafana까지 GPU 관측 경로 확인

다음 시나리오를 순서대로 진행합니다.

1. Host GPU의 기준 상태 확인
2. Container의 GPU 연결 확인
3. Prometheus와 Grafana의 GPU metric 수집 경로 확인

공통 환경:

- 환경 준비: [Ubuntu GPU 환경 준비](../01-setup-ubuntu.md)
- LAN 접속 준비: [같은 Wi-Fi에서 LLM serving endpoint 접속](../03-setup-lan-access.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- OS: Ubuntu 24.04 LTS
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB

## 시나리오 1. Host GPU의 기준 상태를 확인합니다

### 이론

Host의 GPU 이름, driver, VRAM, power limit은 이후 OOM과 성능 결과를 해석하는 기준입니다. Desktop GPU는 화면 출력에 VRAM을 사용하므로 `0 MiB`보다 실습 compute process가 없는 상태를 기준으로 삼습니다.

### 실습

Repository root에서 workspace로 이동하고 기존 workload를 정리합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

두 번째 명령이 process를 출력하면 실습을 진행하지 않습니다. [실행 주체 확인과 안전한 종료 절차](../troubleshooting.md#실습-전-gpu-기준-상태를-만듭니다)를 수행합니다.

Hardware 기준값을 확인합니다.

```bash
nvidia-smi \
  --query-gpu=name,driver_version,memory.total,memory.free,power.limit \
  --format=csv
```

| 항목 | 기준값 |
| --- | --- |
| GPU | NVIDIA GeForce RTX 5060 Ti |
| VRAM | 16311 MiB, nominal 16GB |
| Driver | 595.71.05 |
| CUDA compatibility | 13.2 |
| Power limit | 180W |

`nvidia-smi`의 CUDA 값은 driver가 지원하는 compatibility 상한입니다. Container CUDA runtime과 같은 값일 필요는 없습니다.

## 시나리오 2. Container의 GPU 연결을 확인합니다

### 이론

Host의 `nvidia-smi` 성공은 container가 GPU device와 driver library를 전달받았다는 뜻이 아닙니다. Model을 받기 전에 container 경계를 검증해야 환경 문제와 model 문제를 분리할 수 있습니다.

### 실습

CUDA base image에서 GPU를 조회합니다.

```bash
docker run --rm --gpus all nvidia/cuda:12.9.1-base-ubuntu24.04 nvidia-smi
```

- Host와 같은 GPU 확인: container runtime 연결 정상
- `could not select device driver`: NVIDIA Container Toolkit 구성 확인
- Driver compatibility 오류: host driver와 container CUDA 조합 확인

Model load부터 시도하면 network, model format, CUDA kernel, VRAM 문제가 한 번에 후보가 됩니다. 이 단계에서는 GPU 전달 경로만 확인합니다.

## 시나리오 3. GPU metric 수집 경로를 확인합니다

### 이론

관측 경로는 다음 순서입니다.

```text
nvidia-smi → DCGM Exporter → Prometheus → Grafana
```

어느 구간이 끊겼는지 분리하려면 DCGM 원본 metric, Prometheus target, Grafana datasource를 순서대로 확인합니다.

### 실습

GPU server에서 benchmark image를 build합니다.

```bash
docker compose --profile tools build benchmark
```

GPU server에서 관측 stack을 기동하고 수집 경로를 자동 점검합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
bash scripts/check_observability.sh
docker compose ps
```

Local client에서 GPU server 주소를 지정합니다.

```bash
export GPU_SERVER_IP="<GPU-SERVER-IP>"
```

접속 정보:

- Prometheus: `http://${GPU_SERVER_IP}:9090`
- Grafana: `http://${GPU_SERVER_IP}:3000/d/llm-serving-ch5-6/llm-serving-chapter-5-6`
- Grafana 계정: `admin` / `admin`
- Dashboard: provisioned LLM serving dashboard

Local client에서 원본 metric과 target을 직접 확인합니다.

```bash
curl "http://${GPU_SERVER_IP}:9400/metrics"
curl "http://${GPU_SERVER_IP}:9090/api/v1/targets"
```

완료 조건:

- Host와 container에서 같은 GPU 확인
- VRAM 16311 MiB 확인
- Prometheus에서 DCGM Exporter target `UP`
- Grafana dashboard 접근 가능

이 조건을 만족하면 이후 실패를 GPU 연결이 아니라 model, memory, scheduler 문제로 좁힐 수 있습니다.

참고자료:

- [Ubuntu GPU 환경 준비](../01-setup-ubuntu.md)
- [GPU 실습 troubleshooting](../troubleshooting.md)
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/)
