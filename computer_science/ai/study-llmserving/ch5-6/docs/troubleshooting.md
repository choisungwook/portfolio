# LLM serving GPU 실습 troubleshooting

GPU 실습 결과가 예상과 다르면 model option보다 먼저 GPU 기준 상태와 metric 수집 경로를 확인합니다. VRAM을 0MiB로 만드는 것이 아니라 **실습 compute process가 없는 desktop baseline**에서 시작하는 것이 기준입니다.

## 실습 전 GPU 기준 상태를 만듭니다

Workspace container를 모두 내리고 남은 GPU compute process를 확인합니다.

```bash
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

- workspace의 container와 network만 정리
- Prometheus·Grafana volume과 model cache는 유지
- 다른 workspace의 GPU process는 종료하지 않고 목록을 출력한 뒤 실패
- Xorg·gnome-shell 같은 desktop process의 VRAM은 유지

Desktop GPU는 화면 출력만으로도 VRAM을 사용하므로 `memory.used=0 MiB`가 되지 않습니다. Xorg나 desktop session을 강제로 종료하면 사용자 화면을 끊으므로 초기화 대상으로 삼지 않습니다.

남은 process를 직접 확인할 때는 compute application만 조회합니다.

```bash
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

소유한 process인지 확인한 뒤 해당 service나 process만 종료합니다. PID 전체를 일괄 종료하지 않습니다.

출력된 PID의 실행 주체를 확인합니다.

```bash
ps -fp <PID>
cat /proc/<PID>/cgroup
```

- 일반 process: 실행한 shell이나 service에서 정상 종료
- container·Kubernetes process: process를 직접 kill하지 않고 소유한 workload에서 종료
- 소유자를 모르는 process: 종료하지 않고 실습 관리자에게 확인

본인이 실행한 일반 process에는 정상 종료 신호를 보냅니다.

```bash
kill -TERM <PID>
```

본인이 실행한 container는 container runtime에서 종료합니다.

```bash
docker stop <CONTAINER>
```

본인이 실행한 Kubernetes workload는 controller의 replica를 0으로 줄입니다. Pod만 삭제하면 controller가 다시 생성할 수 있습니다.

```bash
kubectl scale deployment/<WORKLOAD> --replicas=0 -n <NAMESPACE>
```

종료 후 다시 초기화합니다.

```bash
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

Compute process 목록이 비어 있으면 GPU 실습을 시작합니다. 계속 process가 출력되면 같은 확인 절차를 반복하되 `kill -KILL`, 전체 PID 일괄 종료, container runtime 전체 중지는 사용하지 않습니다.

## 관측 경로가 유효한지 한 번에 확인합니다

관측 stack을 기동하고 네 구간을 대조합니다.

```text
nvidia-smi → DCGM Exporter → Prometheus → Grafana datasource
```

자동 점검을 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
bash scripts/check_observability.sh
```

성공 조건:

- Prometheus의 `dcgm-exporter` target이 `UP`
- `nvidia-smi`와 DCGM의 idle VRAM 차이가 256MiB 이내
- DCGM과 Prometheus의 VRAM 차이가 256MiB 이내
- Prometheus GPU sample이 10초보다 오래되지 않음
- Grafana의 Prometheus datasource health가 `OK`

GPU utilization은 같은 순간을 재지 않으므로 세 숫자가 정확히 같을 필요가 없습니다. 값이 0~100 범위이고 Prometheus sample이 최신인지만 확인합니다.

## Grafana VRAM이 OOM log보다 낮습니다

vLLM OOM log는 allocation이 실패한 순간의 process memory를 출력합니다. DCGM은 host GPU 전체를 일정 간격으로 sample하고 Prometheus는 그 값을 다시 scrape합니다. 측정 시점과 범위가 다릅니다.

```text
vLLM OOM log       process allocator의 실패 순간
DCGM_FI_DEV_FB_USED host GPU 전체의 sampled VRAM
Grafana GPU VRAM    DCGM sample의 최근 5초 최대값
```

이 workspace의 수집 간격:

| 구간 | 간격 |
| --- | ---: |
| DCGM GPU 수집 | 1초 |
| Prometheus DCGM scrape | 1초 |
| Grafana GPU panel | 최근 5초 최대값 |

이전 기본값은 DCGM 30초, Prometheus 5초였습니다. 7B OOM처럼 model load peak가 수 초 안에 끝나면 정상 연결이어도 peak를 통째로 놓칠 수 있었습니다. 1초로 줄여 가능성을 낮췄지만 1초보다 짧은 spike까지 보장하지는 않습니다.

Grafana panel은 `DCGM_FI_DEV_FB_USED`의 MiB를 표시합니다. vLLM log의 GiB와 비교할 때는 `GiB × 1024 = MiB`로 단위를 맞춥니다.

## Expected OOM에서 model-server target이 DOWN입니다

`vllm-7b-bf16-expect-failure`는 API server가 준비되기 전에 종료됩니다. 따라서 Prometheus의 `model-server` target이 `DOWN`이고 vLLM application panel이 비어 있는 것이 정상입니다.

Expected OOM에서 확인할 target은 `dcgm-exporter`입니다.

```bash
curl -s http://127.0.0.1:9090/api/v1/targets | \
  jq -r '.data.activeTargets[] | [.labels.job, .health, .lastError] | @tsv'
```

- `dcgm-exporter UP`: OOM 중 hardware metric 수집 가능
- `model-server DOWN`: vLLM 초기화 실패 시 정상
- 둘 다 `DOWN`: 관측 stack 문제부터 해결

## 변경한 수집 간격이 적용되지 않습니다

실행 중인 Prometheus와 DCGM Exporter는 Git pull만으로 설정을 다시 읽지 않을 수 있습니다. 기준 상태부터 다시 만듭니다.

```bash
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
docker compose --profile observability up -d prometheus grafana dcgm-exporter
bash scripts/check_observability.sh
```

Prometheus volume은 유지되므로 이전 시계열도 남습니다. Grafana time range를 실습 실행 시각 전후로 좁혀 새 결과만 확인합니다.

## 참고자료

- [관측 metric과 panel 해석](./prometheus.md)
- [GPU 환경 확인](./handson/01-gpu-environment.md)
- [NVIDIA DCGM Exporter collect interval](https://github.com/NVIDIA/dcgm-exporter/blob/4.6.0-4.8.3/pkg/cmd/app.go)
