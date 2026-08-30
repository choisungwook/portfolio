# BF16·W4A16·W8A8의 성능과 품질 비교

다음 시나리오를 순서대로 진행합니다.

1. BF16 기준점 측정
2. W4A16의 decode·VRAM 변화 측정
3. W8A8의 prefill 변화 측정
4. 성능과 quality gate를 통과한 model 선택

공통 환경:

- 선행 실습: [Prefill·decode 병목 관측](./07-prefill-decode-observability.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB
- 성능 workload: long-prefill, long-decode
- Quality gate: smoke 20문항, GSM8K 앞 20문항
- 비교 지표: TTFT, TPOT, RPS, Output TPS, Peak VRAM, accuracy

비교 model:

| Label | Model | Precision | 가설 |
| --- | --- | --- | --- |
| `bf16` | `Qwen/Qwen2.5-3B-Instruct` | BF16 | Quality·성능 기준점 |
| `gptq-int4` | `Qwen/Qwen2.5-3B-Instruct-GPTQ-Int4` | W4A16 | Weight bandwidth·VRAM 감소 |
| `fp8` | `RedHatAI/Qwen2.5-3B-Instruct-FP8-dynamic` | W8A8 | Long-prefill compute 감소 |

## 시나리오 1. BF16 기준점을 측정합니다

### 이론

Quantization 효과는 같은 model family, workload, scheduler, GPU memory budget에서 BF16과 비교해야 합니다. `VLLM_GPU_MEMORY_UTILIZATION`이 다르면 quantization이 아니라 KV pool 설정 차이를 측정하게 됩니다.

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

기본값 `VLLM_GPU_MEMORY_UTILIZATION=0.85`에서 BF16을 측정합니다.

```bash
docker compose --profile bf16 up -d vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile tools run --rm -e MODEL_LABEL=bf16 -e PRECISION=BF16 benchmark python3 -m benchmark.benchmark_long_prefill
docker compose --profile tools run --rm -e MODEL_LABEL=bf16 -e PRECISION=BF16 benchmark python3 -m benchmark.benchmark_long_decode
docker compose --profile tools run --rm -e MODEL_LABEL=bf16 benchmark python3 -m benchmark.accuracy_smoke
docker compose --profile tools run --rm -e MODEL_LABEL=bf16 benchmark python3 -m benchmark.accuracy_gsm8k
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## 시나리오 2. W4A16의 decode와 VRAM 변화를 측정합니다

### 이론

W4A16은 weight를 줄여 VRAM과 decode의 weight bandwidth를 낮추는 것이 목표입니다. Kernel 또는 dequantization overhead가 크면 VRAM만 줄고 TPOT는 개선되지 않을 수 있습니다.

### 실습

같은 workload와 quality gate를 GPTQ model에 적용합니다.

```bash
docker compose --profile gptq up -d vllm-gptq
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile tools run --rm -e MODEL_LABEL=gptq-int4 -e PRECISION=W4A16 benchmark python3 -m benchmark.benchmark_long_prefill
docker compose --profile tools run --rm -e MODEL_LABEL=gptq-int4 -e PRECISION=W4A16 benchmark python3 -m benchmark.benchmark_long_decode
docker compose --profile tools run --rm -e MODEL_LABEL=gptq-int4 benchmark python3 -m benchmark.accuracy_smoke
docker compose --profile tools run --rm -e MODEL_LABEL=gptq-int4 benchmark python3 -m benchmark.accuracy_gsm8k
docker compose stop vllm-gptq
docker compose rm -f vllm-gptq
```

우선 확인값:

- Peak VRAM
- Long-decode TPOT
- Output TPS

## 시나리오 3. W8A8의 prefill 변화를 측정합니다

### 이론

W8A8은 weight와 activation compute를 줄여 long-prefill을 개선하는 것이 목표입니다. GPU가 FP8 path를 효율적으로 지원하지 않으면 낮은 precision이 속도 향상으로 이어지지 않습니다.

### 실습

같은 조건을 FP8 model에 적용합니다.

```bash
docker compose --profile fp8 up -d vllm-fp8
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile tools run --rm -e MODEL_LABEL=fp8 -e PRECISION=W8A8 benchmark python3 -m benchmark.benchmark_long_prefill
docker compose --profile tools run --rm -e MODEL_LABEL=fp8 -e PRECISION=W8A8 benchmark python3 -m benchmark.benchmark_long_decode
docker compose --profile tools run --rm -e MODEL_LABEL=fp8 benchmark python3 -m benchmark.accuracy_smoke
docker compose --profile tools run --rm -e MODEL_LABEL=fp8 benchmark python3 -m benchmark.accuracy_gsm8k
docker compose stop vllm-fp8
docker compose rm -f vllm-fp8
```

우선 확인값:

- Long-prefill TTFT
- RPS
- Peak VRAM

## 시나리오 4. 성능과 quality gate로 model을 선택합니다

### 이론

VRAM이 가장 작은 model이 반드시 가장 빠르지는 않습니다. W4A16과 W8A8은 줄이는 data와 유리한 workload가 다릅니다.

| 질문 | 판단 지표 |
| --- | --- |
| Long-prefill이 빨라졌는가 | TTFT·RPS |
| Long-decode가 빨라졌는가 | TPOT·Output TPS |
| Request capacity가 늘었는가 | Peak VRAM·KV cache pool |
| 출력 quality를 유지했는가 | Smoke·GSM8K-20 accuracy |

20문항 accuracy는 큰 regression을 찾는 quick gate입니다. 실제 채택에는 full evaluation과 domain dataset이 필요합니다.

### 실습

성능과 quality 결과를 하나의 표로 결합합니다.

```bash
docker compose --profile tools run --rm benchmark python3 -m benchmark.summary
```

선택 순서:

1. Quality gate를 통과한 model만 남김
2. 목표 workload의 TTFT 또는 TPOT 비교
3. Output TPS와 Peak VRAM trade-off 확인
4. GPU kernel 지원과 운영 SLO를 포함해 최종 선택

참고자료:

- [LLM serving optimization 이론](../04-ch6-theory.md)
- [GSM8K 20문항 점수의 한계](../06-gsm8k-deep-dive.md)
