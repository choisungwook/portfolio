# Prefill과 decode 병목을 metric으로 구분

다음 시나리오를 순서대로 진행합니다.

1. Long-prefill workload에서 첫 token 지연 분석
2. Long-decode workload에서 token 생성 지연 분석
3. 같은 E2E latency의 원인을 lifecycle metric으로 구분

공통 환경:

- 선행 실습: [Admission 전략 비교](./06-batch-strategies.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- Runtime: vLLM `v0.27.1`
- Model: `Qwen/Qwen2.5-3B-Instruct`
- Scheduler: `max_num_seqs 8`, `max_num_batched_tokens 4096`

## 시나리오 1. Long-prefill의 첫 token 지연을 분석합니다

### 이론

긴 input과 짧은 output은 prefill 비중이 큽니다. TTFT가 증가해도 queue time이 함께 증가하면 prompt 계산만의 문제로 단정할 수 없습니다.

가설:

- Queue p95 안정, Prefill p95·TTFT 증가: 긴 prompt 계산 비용
- Queue p95·TTFT 동반 증가: scheduler 대기 포함
- Peak VRAM 증가: 긴 context의 memory 영향

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

관측 stack과 server를 기동합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
VLLM_MAX_NUM_SEQS=8 VLLM_MAX_NUM_BATCHED_TOKENS=4096 \
  docker compose --profile bf16 up -d --force-recreate vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/metrics
curl http://127.0.0.1:9090/api/v1/targets
```

Long-prefill workload를 실행합니다.

```bash
docker compose --profile tools run --rm \
  -e MODEL_LABEL=bf16 \
  -e PRECISION=BF16 \
  -e VLLM_MAX_NUM_SEQS=8 \
  -e VLLM_MAX_NUM_BATCHED_TOKENS=4096 \
  benchmark python3 -m benchmark.benchmark_long_prefill
```

Grafana 확인 순서:

1. Queue p95
2. Prefill p95
3. TTFT p95
4. GPU utilization·power
5. Peak VRAM

## 시나리오 2. Long-decode의 token 생성 지연을 분석합니다

### 이론

짧은 input과 긴 output은 decode 비중이 큽니다. 낮은 concurrency에서 TPOT가 좋아도 request가 늘면 waiting queue와 KV cache 사용률이 증가할 수 있습니다.

가설:

- Decode p95·TPOT 증가: output 생성 비용 증가
- Output TPS 정체·waiting 증가: serving capacity 포화
- TPOT·KV cache 사용률 동반 증가: decode concurrency와 memory pressure

### 실습

Long-decode workload를 실행합니다.

```bash
docker compose --profile tools run --rm \
  -e MODEL_LABEL=bf16 \
  -e PRECISION=BF16 \
  -e VLLM_MAX_NUM_SEQS=8 \
  -e VLLM_MAX_NUM_BATCHED_TOKENS=4096 \
  benchmark python3 -m benchmark.benchmark_long_decode
```

Grafana 확인 순서:

1. Decode p95
2. TPOT p95
3. Output TPS
4. Running·waiting request
5. KV cache 사용률·VRAM

## 시나리오 3. 같은 E2E latency의 원인을 구분합니다

### 이론

TTFT와 TPOT는 사용자가 겪은 결과입니다. Queue, prefill, decode, KV cache metric은 지연이 발생한 단계를 보여 줍니다.

| Workload | 우선 확인 metric | 병목 가설 |
| --- | --- | --- |
| Long-prefill | Queue·Prefill·TTFT p95 | Scheduler 대기 또는 prompt 계산 |
| Long-decode | Decode·TPOT·Output TPS | Weight·KV cache data movement |

Lifecycle metric은 느린 단계를 좁히지만 compute와 memory bandwidth 원인을 직접 판정하지는 못합니다. 그 판정은 [roofline과 병목 재현](./04-roofline-bottleneck.md)의 이론 상한과 실측 token 속도를 사용합니다.

### 실습

두 결과 파일을 확인합니다.

```bash
ls results/performance-bf16-long-*.json
```

판단 순서:

1. Queue 증가 여부 확인
2. Prefill 또는 decode 시간 증가 확인
3. TTFT 또는 TPOT와 연결
4. Running·waiting으로 scheduler 포화 확인
5. KV cache와 VRAM으로 memory pressure 확인
6. Roofline과 token/s 상한으로 compute·bandwidth 방향 확인

실험 후 model server를 종료합니다.

```bash
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

참고자료:

- [LLM serving metric 해석](../prometheus.md)
- [vLLM v0.27.1 metrics](https://docs.vllm.ai/en/v0.27.1/usage/metrics/)
