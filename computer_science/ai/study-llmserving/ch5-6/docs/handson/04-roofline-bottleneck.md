# GPU roofline을 측정하고 병목 재현

다음 시나리오를 순서대로 진행합니다.

1. GPU의 peak BF16 성능과 memory bandwidth 측정
2. Arithmetic intensity와 crossover로 workload 분류
3. Decode와 prefill 병목 재현
4. GPU metric의 병목 판별 한계 확인

공통 환경:

- 선행 실습: [KV cache 배치·시퀀스 실습](./03-kv-cache-batch-sequence.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB
- 이론: [Memory와 roofline 이론](../02-ch5-theory.md)

## 시나리오 1. GPU의 roofline 천장을 측정합니다

### 이론

Roofline은 workload의 arithmetic intensity와 hardware 상한을 겹쳐 병목 방향을 찾습니다.

| 축 | 단위 | 의미 |
| --- | --- | --- |
| x | FLOPS/Byte | 1 byte를 옮길 때 수행하는 연산 수 |
| y | TFLOPS | 해당 intensity에서 hardware가 낼 수 있는 연산 속도 |

Roofline이 꺾이는 crossover는 다음처럼 계산합니다.

```text
crossover = peak FLOPS ÷ memory bandwidth
```

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

큰 행렬 곱으로 peak BF16 성능을, device 복사로 memory bandwidth를 측정합니다.

```bash
docker compose --profile tools build benchmark
docker compose --profile tools run --rm gpu-probe
docker compose --profile tools run --rm benchmark python3 -m calculators.plot_roofline
```

실측 예시:

| 항목 | RTX 5060 Ti 실측 |
| --- | ---: |
| Peak BF16 | 50.3 TFLOPS |
| Memory bandwidth | 384 GB/s |
| Crossover | 131 FLOPS/B |

그래프는 `results/roofline.png`에 저장됩니다.

## 시나리오 2. Workload를 compute-bound와 bandwidth-bound로 분류합니다

### 이론

Arithmetic intensity는 행렬 크기가 정하고, crossover는 GPU가 정합니다. 같은 workload도 GPU의 crossover에 따라 판정이 달라질 수 있습니다.

Decode는 token 하나를 생성할 때 `[1, h] × [h, h]` projection을 반복하므로 intensity가 낮습니다. 긴 prompt의 prefill은 큰 행렬 연산으로 intensity가 올라갑니다.

Roofline은 상한 모델입니다. Kernel launch, cache hit, scheduler, thermal 상태를 포함한 latency 예측기는 아닙니다.

### 실습

Projection workload의 intensity를 계산합니다.

```bash
docker compose --profile tools run --rm benchmark python3 -m calculators.memory_budget
docker compose --profile tools run --rm benchmark python3 -m calculators.roofline
```

Hidden size 4096 기준 예시입니다.

| Sequence 길이 | Intensity | Crossover 131 기준 판정 |
| ---: | ---: | --- |
| 1 | 1.0 | Memory bandwidth-bound |
| 64 | 62.1 | Memory bandwidth-bound |
| 512 | 409.6 | Compute-bound |
| 4096 | 1365.3 | Compute-bound |

작은 행렬이 roofline 상한보다 느린 것은 kernel launch overhead가 상대적으로 크기 때문입니다.

## 시나리오 3. Decode와 prefill 병목을 재현합니다

### 이론

Batch 1 decode에서 token 하나를 만들려면 model weight 전체를 읽어야 합니다. 따라서 memory bandwidth로 token 생성 상한을 근사할 수 있습니다.

```text
batch 1 decode 상한(token/s) = memory bandwidth ÷ weight bytes
```

Qwen2.5-3B BF16의 weight가 5.79 GiB이면 다음 값이 나옵니다.

```text
384 GB/s ÷ 6.18 GB = 약 62 token/s
```

Batching은 한 번 읽은 weight를 여러 request가 공유해 전체 처리량을 높입니다.

### 실습

Server와 관측 stack을 기동하고 네 workload를 실행합니다.

```bash
docker compose --profile bf16 up -d vllm-bf16
docker compose --profile observability up -d prometheus grafana dcgm-exporter
docker compose --profile tools run --rm \
  -e MEASURED_BANDWIDTH_GBPS=384 \
  benchmark python3 -m benchmark.bottleneck_probe
```

| 시나리오 | 동시성 | Prompt | 생성 | 목표 |
| --- | ---: | ---: | ---: | --- |
| Decode-bound | 1 | 32 | 512 | Batch 1 bandwidth 상한 확인 |
| Batched decode | 16 | 32 | 512 | Weight read 공유 확인 |
| Prefill-bound | 8 | 3584 | 1 | Compute pressure 확인 |
| Mixed | 8 | 512 | 128 | 혼합 workload 확인 |

실측 예시:

| 시나리오 | 요청당 token/s | 이론 상한 대비 | 전체 Output TPS |
| --- | ---: | ---: | ---: |
| Decode-bound | 62.5 | 1.01 | 62 |
| Batched decode | 59.7 | 0.96 | 955 |

요청당 속도는 비슷하지만 전체 처리량은 약 15배 증가합니다. 상한과 1% 정도 차이는 L2 cache 재사용과 bandwidth 측정 방식에서 생길 수 있습니다.

## 시나리오 4. GPU metric만으로 병목을 구분할 수 있는지 확인합니다

### 이론

`DCGM_FI_DEV_GPU_UTIL`과 `DCGM_FI_DEV_MEM_COPY_UTIL`은 바쁜 시간 비율을 나타냅니다. 실제 DRAM bandwidth 사용률이나 compute 효율을 직접 뜻하지 않습니다.

GeForce GPU에서는 `DCGM_FI_PROF_DRAM_ACTIVE` 같은 profiling metric이 노출되지 않을 수 있습니다. 이 경우 두 utilization metric만으로 compute와 bandwidth 병목을 구분할 수 없습니다.

### 실습

DCGM Exporter가 profiling metric을 노출하는지 확인합니다.

```bash
curl -s localhost:9400/metrics | grep "^# HELP" | grep PROF
```

아무것도 출력되지 않으면 다음 근거를 함께 사용합니다.

- Roofline의 crossover와 workload intensity
- Batch 1 decode의 bandwidth 기반 token/s 상한
- 실측 token/s와 이론 상한의 거리
- Running, waiting, queue metric

Grafana의 `Compute vs Bandwidth pressure` panel은 두 값이 함께 낮아 GPU가 쉬는 상황을 찾는 용도로 사용합니다.

정리:

- Crossover는 GPU마다 직접 측정합니다.
- Decode는 구조적으로 arithmetic intensity가 낮습니다.
- Batch 1 decode 실측이 bandwidth 상한에 가까우면 bandwidth 병목 근거가 됩니다.
- GPU utilization과 memory copy utilization만으로 병목을 단정하지 않습니다.
- Batching은 weight read를 공유해 전체 decode 처리량을 높입니다.

참고자료:

- [Memory와 roofline 이론](../02-ch5-theory.md)
- [Metric 해석](../prometheus.md)
