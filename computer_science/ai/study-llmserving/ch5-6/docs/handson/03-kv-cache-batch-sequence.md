# 배치와 시퀀스에 따라 KV cache가 차는 과정

다음 시나리오를 순서대로 진행합니다.

1. Attention 구조로 token당 KV cache 크기 계산
2. vLLM metric으로 KV cache pool과 사용률 확인
3. 동시 요청 수와 prompt 길이를 늘려 scheduler 제한 확인
4. `max_num_seqs`를 높여 KV cache 제한 확인
5. GPU memory 예산과 context 길이로 동시성 조정

공통 환경:

- 선행 실습: [16GB GPU에서 7B BF16이 OOM 나는 이유](./02-memory-budget-oom.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB
- Model: Qwen2.5-3B-Instruct BF16, `max-model-len 4096`

## 시나리오 1. Attention 구조로 token당 KV cache 크기를 계산합니다

### 이론

KV cache의 token당 크기는 parameter 수가 아니라 layer 수, KV head 수, head dimension, dtype으로 결정됩니다.

```text
KV bytes/token = 2 × layers × KV heads × head dimension × dtype bytes
```

Qwen2.5-3B-Instruct는 layers 36, KV heads 2, head dimension 128, BF16입니다.

```text
2 × 36 × 2 × 128 × 2 = 36,864 bytes = 36 KiB
```

MHA는 attention head마다 KV head를 두고, GQA는 여러 attention head가 적은 KV head를 공유합니다. 따라서 비슷한 parameter 수라도 attention 구조에 따라 KV cache 크기가 크게 달라집니다.

| Model | Attention | KV heads | KV/token | 같은 16GB에서 4096-token 요청 |
| --- | --- | ---: | ---: | ---: |
| Llama-2-7B | MHA | 32 | 512 KiB | 0개 |
| Qwen2.5-3B | GQA | 2 | 36 KiB | 약 61개 |

### 실습

Repository root에서 workspace로 이동하고 기존 GPU workload를 정리합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

두 번째 명령이 process를 출력하면 [실행 주체 확인과 안전한 종료 절차](../troubleshooting.md#실습-전-gpu-기준-상태를-만듭니다)를 수행합니다.

계산기를 실행해 model별 KV 비용을 비교합니다.

```bash
docker compose --profile tools build benchmark
docker compose --profile tools run --rm benchmark python3 -m calculators.memory_budget
```

## 시나리오 2. vLLM metric으로 KV cache를 확인합니다

### 이론

vLLM은 기동할 때 KV cache pool을 미리 확보합니다. 요청이 사용하는 block 비율과 pool 구조를 `/metrics`에서 확인할 수 있습니다.

| Metric | 확인값 | 해석 |
| --- | --- | --- |
| `vllm:kv_cache_usage_perc` | 사용 중인 block 비율, `1`이 100% | 현재 pool 점유율 |
| `vllm:cache_config_info` | `num_gpu_blocks`, `block_size` label | pool이 담는 전체 token 수 계산 |
| `vllm:num_requests_running` | 실행 중인 request 수 | KV block을 할당받은 request 확인 |
| `vllm:num_requests_waiting` | 대기 request 수 | scheduler 또는 memory 제한 확인 |
| `DCGM_FI_DEV_FB_USED` | GPU 전체 framebuffer 사용량 | weight·runtime·KV cache를 합친 VRAM 확인 |

`vllm:kv_cache_usage_perc`는 KV cache pool의 block 점유율입니다. KV cache가 차지한 VRAM byte나 request별 사용량을 직접 반환하지는 않습니다.

Pool token 수와 이론상 byte는 다음처럼 계산합니다.

```text
pool tokens = num_gpu_blocks × block_size
pool bytes = pool tokens × KV bytes/token
```

### 실습

Server와 관측 stack을 기동합니다.

```bash
docker compose --profile bf16 up -d vllm-bf16
docker compose --profile observability up -d prometheus grafana dcgm-exporter
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
```

vLLM 원본 metric을 확인합니다.

```bash
curl -s http://127.0.0.1:8000/metrics \
  | grep -E 'vllm:(kv_cache_usage_perc|cache_config_info|num_requests_(running|waiting))'
```

Prometheus에서 현재 KV cache 사용률을 percent로 조회합니다.

```bash
curl -sG http://127.0.0.1:9090/api/v1/query \
  --data-urlencode 'query=max(vllm:kv_cache_usage_perc) * 100'
```

vLLM log의 pool 계산도 확인합니다.

```bash
docker compose --profile bf16 logs vllm-bf16 | grep -i "KV cache"
```

실측 예시입니다.

```text
Available KV cache memory: 6.76 GiB
GPU KV cache size: 196,896 tokens
Maximum concurrency for 4,096 tokens per request: 48.07x
```

위 값은 token당 36,864 bytes 계산과 일치합니다.

```text
196,896 tokens × 36,864 B = 6.76 GiB
196,896 ÷ 4,096            = 48.07
```

## 시나리오 3. Scheduler 제한이 KV cache 사용률을 멈추는지 확인합니다

### 이론

KV cache 공식은 scheduler에 admit되어 block을 할당받은 request에만 적용됩니다. 대기 request는 KV cache를 사용하지 않습니다.

```text
실제 최대 동시 request = min(max_num_seqs, KV pool이 수용하는 request 수)
```

KV cache 사용률이 낮은데 `running`이 고정되고 `waiting`이 증가하면 memory가 아니라 `max_num_seqs`가 제한입니다.

### 실습

`max_num_seqs 8`에서 동시성과 prompt 길이를 변경합니다.

```bash
docker compose --profile tools run --rm benchmark python3 -m benchmark.kv_cache_probe
```

실측 예시입니다.

| 동시성 | Prompt | Running | Waiting | 예측 KV% | 실측 KV% | TTFT p95 | TPOT p50 | Output TPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 256 | 1 | 0 | 0.20% | 0.21% | 74 ms | 15.9 ms | 60 |
| 4 | 256 | 4 | 0 | 0.78% | 0.81% | 184 ms | 15.9 ms | 229 |
| 8 | 256 | 8 | 0 | 1.56% | 1.56% | 352 ms | 16.2 ms | 420 |
| 8 | 2048 | 8 | 3 | 8.84% | 8.91% | 2,257 ms | 21.8 ms | 227 |
| 16 | 2048 | 8 | 11 | 17.68% | **8.91%** | 6,669 ms | 26.0 ms | 229 |
| 32 | 2048 | 8 | 27 | 35.36% | **8.93%** | 15,584 ms | 26.3 ms | 229 |
| 48 | 2048 | 8 | 43 | 53.05% | **8.93%** | 23,908 ms | 28.3 ms | 229 |

확인할 패턴:

- 동시성 8까지 예측과 실측 KV 사용률이 일치
- 동시성 8 이후 `running`과 KV 사용률이 고정
- 추가 request는 `waiting`과 TTFT를 증가시킴
- Output TPS는 거의 고정되고 TPOT는 완만하게 증가

Grafana의 `KV pool occupancy vs admitted requests` panel에서 KV pool used %, running, waiting을 같은 시간축으로 확인합니다.

## 시나리오 4. Scheduler 제한을 높여 KV cache 제한에 접근합니다

### 이론

`max_num_seqs`를 높이면 더 많은 request가 KV block을 할당받습니다. 같은 weight 읽기를 여러 request가 공유해 처리량은 늘지만, request별 token 간격과 KV cache 사용량도 증가할 수 있습니다.

### 실습

`max_num_seqs`를 64로 높이고 같은 sweep을 실행합니다.

```bash
VLLM_MAX_NUM_SEQS=64 docker compose --profile bf16 up -d --force-recreate vllm-bf16
docker compose --profile tools run --rm benchmark python3 -m benchmark.kv_cache_probe
```

실측 예시입니다.

| 동시성 | Prompt | Running | 예측 KV% | 실측 KV% | TTFT p95 | TPOT p50 | Output TPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 2048 | 8 | 10.04% | 10.12% | 2,268 ms | 21.9 ms | 227 |
| 16 | 2048 | 16 | 20.09% | 20.25% | 4,547 ms | 32.2 ms | 293 |
| 32 | 2048 | 32 | 40.17% | 40.29% | 8,923 ms | 53.9 ms | 340 |
| 48 | 2048 | 48 | 60.26% | 60.34% | 13,493 ms | 78.2 ms | 351 |

동시성 48, prompt 2048 조건을 비교합니다.

| Metric | `max_num_seqs 8` | `max_num_seqs 64` |
| --- | ---: | ---: |
| Output TPS | 229 | **351** |
| TPOT p50 | 28.3 ms | **78.2 ms** |
| TTFT p95 | 23.9 s | **13.5 s** |
| KV pool 점유율 | 8.9% | **60.3%** |

Throughput과 token latency는 같은 scheduler 설정의 trade-off입니다. Latency SLO를 만족하는 범위에서 동시성을 선택합니다.

## 시나리오 5. GPU memory 예산과 context 길이로 동시성을 조정합니다

### 이론

`gpu-memory-utilization`은 현재 여유 VRAM이 아니라 전체 VRAM에 적용됩니다. 값을 낮추면 model weight와 runtime 영역보다 KV pool이 먼저 줄어듭니다.

| 항목 | `utilization 0.9` | `utilization 0.85` |
| --- | ---: | ---: |
| 적용 예산 | 14.34 GiB | 13.54 GiB |
| Model weight | 5.79 GiB | 5.79 GiB |
| KV pool | 6.76 GiB | 5.95 GiB |
| 4096-token 최대 동시성 | 48.07 | 42.32 |

Context 길이는 request 하나가 pool을 소비하는 속도를 정합니다. 같은 동시성 8에서도 prompt가 256에서 2048로 늘면 실측 KV 사용률이 1.56%에서 8.91%로 증가합니다.

### 실습

Desktop process 때문에 기본 설정으로 기동할 수 없으면 전체 VRAM 기준 예산을 낮춥니다.

```bash
VLLM_GPU_MEMORY_UTILIZATION=0.85 docker compose --profile bf16 up -d --force-recreate vllm-bf16
```

다음 세 값을 함께 기록합니다.

- `VLLM_GPU_MEMORY_UTILIZATION`
- `max-model-len`
- `vllm:cache_config_info`의 `num_gpu_blocks`, `block_size`

정리:

- KV/token은 attention 구조가 결정합니다.
- KV cache 사용률은 `vllm:kv_cache_usage_perc`로 직접 확인할 수 있습니다.
- Pool 크기는 `vllm:cache_config_info`와 token당 KV byte로 계산할 수 있습니다.
- 대기 request는 KV cache를 사용하지 않습니다.
- 최대 동시성은 scheduler 제한과 KV pool 제한 중 작은 값입니다.
- Context 길이와 동시성을 늘리면 KV cache 사용률과 latency가 함께 변합니다.

참고자료:

- [Memory와 KV cache 이론](../02-ch5-theory.md)
- [Metric 해석](../prometheus.md)
- [vLLM v0.27.1 metrics](https://docs.vllm.ai/en/v0.27.1/usage/metrics/)
