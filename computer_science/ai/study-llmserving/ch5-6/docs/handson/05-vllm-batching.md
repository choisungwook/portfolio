# Latency SLO를 만족하는 vLLM batch 설정 찾기

다음 시나리오를 순서대로 진행합니다.

1. Latency 우선 설정 측정
2. 균형 설정 측정
3. Throughput 우선 설정 측정
4. 세 결과에서 SLO를 만족하는 설정 선택

공통 환경:

- 선행 실습: [GPU roofline과 병목 재현](./04-roofline-bottleneck.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- Runtime: vLLM `v0.27.1`
- Model: `Qwen/Qwen2.5-3B-Instruct`
- 고정 조건: model, prompt, output limit, concurrency 1·4·8

비교 설정:

| 설정 | `max_num_seqs` | `max_num_batched_tokens` | 예상 trade-off |
| --- | ---: | ---: | --- |
| Latency 우선 | 1 | 512 | Queue 감소, throughput 제한 |
| 균형 | 4 | 2048 | 작은 concurrency와 token budget 수용 |
| Throughput 우선 | 8 | 4096 | 동시 처리 증가, queue·VRAM 증가 가능 |

## 시나리오 1. Latency 우선 설정을 측정합니다

### 이론

`max_num_seqs`는 iteration에서 처리하는 sequence 상한이고, `max_num_batched_tokens`는 iteration의 token budget입니다. Sequence를 하나로 제한하면 경쟁은 줄지만 weight read를 공유하지 못해 처리량이 제한됩니다.

vLLM `v0.27.1`에는 고정 `max_delay_ms` serve option이 없습니다. Batch 대기는 Queue time, TTFT, E2E latency로 측정합니다.

### 실습

Workspace로 이동하고 기존 GPU workload를 정리합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

두 번째 명령이 process를 출력하면 [실행 주체 확인과 안전한 종료 절차](../troubleshooting.md#실습-전-gpu-기준-상태를-만듭니다)를 수행합니다.

관측 stack과 latency 우선 server를 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
VLLM_MAX_NUM_SEQS=1 VLLM_MAX_NUM_BATCHED_TOKENS=512 \
  docker compose --profile bf16 up -d --force-recreate vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile tools run --rm \
  -e MODEL_LABEL=bf16-seq1-tokens512 \
  -e PRECISION=BF16 \
  -e VLLM_MAX_NUM_SEQS=1 \
  -e VLLM_MAX_NUM_BATCHED_TOKENS=512 \
  benchmark python3 -m benchmark.benchmark_vllm_batching
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## 시나리오 2. 균형 설정을 측정합니다

### 이론

Sequence 4와 token budget 2048은 일부 data reuse를 허용하면서 과도한 queue 증가를 피하려는 중간값입니다.

### 실습

같은 workload를 균형 설정에서 실행합니다.

```bash
VLLM_MAX_NUM_SEQS=4 VLLM_MAX_NUM_BATCHED_TOKENS=2048 \
  docker compose --profile bf16 up -d --force-recreate vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile tools run --rm \
  -e MODEL_LABEL=bf16-seq4-tokens2048 \
  -e PRECISION=BF16 \
  -e VLLM_MAX_NUM_SEQS=4 \
  -e VLLM_MAX_NUM_BATCHED_TOKENS=2048 \
  benchmark python3 -m benchmark.benchmark_vllm_batching
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## 시나리오 3. Throughput 우선 설정을 측정합니다

### 이론

더 큰 sequence와 token budget은 GPU data reuse를 늘릴 수 있습니다. Capacity를 넘으면 waiting request, KV cache 사용률, TTFT가 함께 증가합니다.

### 실습

가장 큰 설정에서 동일 workload를 실행합니다.

```bash
VLLM_MAX_NUM_SEQS=8 VLLM_MAX_NUM_BATCHED_TOKENS=4096 \
  docker compose --profile bf16 up -d --force-recreate vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile tools run --rm \
  -e MODEL_LABEL=bf16-seq8-tokens4096 \
  -e PRECISION=BF16 \
  -e VLLM_MAX_NUM_SEQS=8 \
  -e VLLM_MAX_NUM_BATCHED_TOKENS=4096 \
  benchmark python3 -m benchmark.benchmark_vllm_batching
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## 시나리오 4. Latency SLO를 만족하는 설정을 선택합니다

### 이론

가장 큰 batch가 항상 운영 capacity를 높이지는 않습니다. Queue와 E2E p95가 SLO를 넘으면 높은 throughput은 사용자 대기 증가의 결과일 수 있습니다.

| 관찰 | 해석 |
| --- | --- |
| Output TPS 증가, Queue p95 허용 범위 | Batching 이득 있음 |
| Queue·E2E p95 증가, throughput 정체 | 설정이 너무 큼 |
| Waiting과 GPU utilization 증가 | GPU capacity 포화 가능 |
| Waiting 증가, GPU utilization 낮음 | Scheduler·runtime 추가 확인 |

### 실습

세 JSON을 하나의 표로 결합합니다.

```bash
ls results/performance-bf16-seq*-vllm-batching.json
docker compose --profile tools run --rm benchmark python3 -m benchmark.summary
```

선택 기준:

1. TTFT와 E2E p95가 SLO를 만족하는 설정만 남김
2. 남은 설정 중 Output TPS가 가장 높은 값 선택
3. `results/summary.md`에서 scheduler 설정과 결과 연결 확인

참고자료:

- [vLLM v0.27.1 serve options](https://docs.vllm.ai/en/v0.27.1/cli/serve/)
- [vLLM v0.27.1 metrics](https://docs.vllm.ai/en/v0.27.1/usage/metrics/)
