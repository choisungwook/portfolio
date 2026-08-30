# GPU가 보여도 container에서 못 쓰는 이유부터 확인합니다

Host의 `nvidia-smi`가 성공해도 vLLM container가 GPU를 사용할 수 있다는 뜻은 아닙니다. Driver, NVIDIA Container Toolkit, container CUDA runtime까지 이어져야 model 실행 문제와 환경 문제를 분리할 수 있습니다.

## 실습 환경

- 환경 준비: [Ubuntu GPU 환경 준비](../01-setup-ubuntu.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- 이후 모든 명령: 위 workspace에서 실행
- OS: Ubuntu 24.04 LTS
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB

Repository root에서 workspace로 이동합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
```

## 실습 전 GPU process를 정리합니다

이전 실습과 다른 workload가 사용하는 GPU compute process를 정리하고 desktop baseline을 확인합니다.

```bash
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

두 번째 명령이 process를 출력하면 실습을 진행하지 않습니다. [실행 주체 확인과 안전한 종료 절차](../troubleshooting.md#실습-전-gpu-기준-상태를-만듭니다)를 수행한 뒤 두 명령을 다시 실행합니다.

VRAM이 0MiB가 아니어도 compute process가 없으면 정상입니다.

## 먼저 host의 기준값을 고정합니다

이 값은 이후 OOM과 성능 결과를 해석할 hardware 기준입니다.

```bash
nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free,power.limit --format=csv
```

| 항목 | 기준값 |
| --- | --- |
| GPU | NVIDIA GeForce RTX 5060 Ti |
| VRAM | 16311MiB, nominal 16GB |
| Driver | 595.71.05 |
| CUDA compatibility | 13.2 |
| Power limit | 180W |

여기서 CUDA 13.2는 driver가 지원하는 compatibility 상한입니다. 실습 container의 CUDA 12.9 runtime과 같은 값일 필요는 없습니다.

## Container 경계에서 GPU 연결을 검증합니다

다음 명령은 model을 받기 전에 Docker가 GPU device와 driver library를 전달하는지 확인합니다.

```bash
docker run --rm --gpus all nvidia/cuda:12.9.1-base-ubuntu24.04 nvidia-smi
```

- host와 같은 GPU 확인: container runtime 연결 정상
- `could not select device driver`: NVIDIA Container Toolkit 구성 확인
- driver compatibility 오류: host driver와 container CUDA 조합 확인

여기서 model load까지 바로 시도할 수도 있습니다. 하지만 실패하면 network, model format, CUDA kernel, VRAM이 한꺼번에 후보가 됩니다. `nvidia-smi`부터 확인하면 환경 문제를 먼저 제외할 수 있습니다.

## 관측이 가능한 실습 기반을 만듭니다

공통 vLLM image와 benchmark client를 build합니다.

```bash
docker compose --profile tools build benchmark
```

Prometheus, Grafana, DCGM Exporter를 실행하고 수집 경로를 자동 점검합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
bash scripts/check_observability.sh
docker compose ps
```

- Prometheus: `http://127.0.0.1:9090`
- Grafana: `http://127.0.0.1:3000`
- Grafana 계정: `admin` / `admin`
- dashboard: `LLM serving / LLM Serving Chapter 5-6`

원본 metric을 직접 확인할 때만 다음 명령을 사용합니다.

```bash
curl http://127.0.0.1:9090/api/v1/targets
curl http://127.0.0.1:9400/metrics
```

## 판단

- host와 container에서 같은 GPU가 보임
- VRAM 16311MiB 확인
- Prometheus에서 DCGM Exporter target이 `UP`
- Grafana dashboard 접근 가능

이 네 조건을 만족하면 이후 실패를 GPU 연결이 아니라 model·memory·scheduler 문제로 좁힐 수 있습니다.

## 참고자료

- [Ubuntu GPU 환경 준비](../01-setup-ubuntu.md)
- [GPU 실습 troubleshooting](../troubleshooting.md)
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/)
