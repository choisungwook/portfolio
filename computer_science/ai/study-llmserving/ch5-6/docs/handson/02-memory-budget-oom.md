# 16GB GPU에서 7B BF16 serving이 실패하는 이유

다음 시나리오를 순서대로 진행합니다.

1. Weight와 runtime을 포함한 memory budget 계산
2. 7B BF16 model load OOM 재현
3. 7B BF16 vLLM 초기화 실패 재현
4. 3B BF16에서 model load와 KV cache pool 확인

공통 환경:

- 선행 실습: [Host부터 Grafana까지 GPU 관측 경로 확인](./01-gpu-environment.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB

## 시나리오 1. 7B BF16의 memory budget을 계산합니다

### 이론

7B BF16 weight는 약 14.2 GiB입니다. 16GB GPU에 남는 약 1.7 GiB는 CUDA context, allocator, temporary tensor, activation, KV cache에 충분하지 않습니다.

| Precision | 7B weight 근사 | 16GB GPU 가설 |
| --- | ---: | --- |
| BF16 | 약 14.2 GiB | Runtime·KV cache 여유 부족 |
| FP8·INT8 | 약 7.1 GiB | 실행 가능, KV cache 검증 필요 |
| INT4 | 약 3.5 GiB | Batch·context 확장 여유 증가 |

같은 parameter 수라도 KV head 수에 따라 request capacity가 달라집니다.

| Model | Attention | KV heads | KV/token | 4096-token 요청 수 |
| --- | --- | ---: | ---: | ---: |
| Llama-2-7B | MHA | 32 | 512 KiB | 0 |
| Qwen2.5-7B | GQA | 4 | 56 KiB | 1 |
| Qwen2.5-3B | GQA | 2 | 36 KiB | 61 |

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

관측 stack을 실행하고 계산기로 가설을 만듭니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
bash scripts/check_observability.sh
docker compose --profile tools run --rm benchmark python3 -m calculators.memory_budget
docker compose --profile tools run --rm benchmark python3 -m calculators.roofline
```

## 시나리오 2. 7B BF16 model load OOM을 재현합니다

### 이론

Model weight가 nominal VRAM보다 작아도 실제 load에는 CUDA context와 allocator가 필요합니다. OOM 순간의 process allocator 값과 DCGM의 GPU 전체 framebuffer 값은 측정 범위가 다르므로 숫자가 같지 않아도 됩니다.

### 실습

7B BF16 model을 CUDA로 이동합니다.

```bash
docker compose --profile tools run --rm \
  model-loader python3 -m model_loader.load_7b_expect_oom
```

- 기대 결과: CUDA OOM
- 저장 결과: `results/ch5-7b-bf16-oom.json`
- OOM이 아닌 오류: network, model format, kernel 문제 확인
- Grafana: GPU VRAM panel의 최근 5초 최대값 확인

실패 자체보다 계산한 weight와 실제 GPU memory 사이의 runtime 비용을 확인하는 것이 목적입니다.

## 시나리오 3. 7B BF16 vLLM 초기화 실패를 재현합니다

### 이론

Serving engine은 model load 뒤 activation을 profiling하고 KV cache pool을 확보합니다. vLLM은 기동 시 pool을 미리 만들므로 실행 중 요청으로 KV cache를 채우기 전에 실패할 수 있습니다.

### 실습

동시 sequence를 하나로 제한한 설정으로 vLLM을 기동합니다.

```bash
docker compose --profile oom run --rm vllm-7b-bf16-expect-failure
```

- 기대 결과: API server 준비 전 GPU memory 부족으로 종료
- 실패 형태: CUDA OOM 또는 KV cache pool 초기화 오류
- OOM이 아닌 오류: network, model format, kernel 문제 확인

7B BF16은 request를 받기 전에 serving 작업 공간을 확보하지 못합니다.

## 시나리오 4. 3B BF16에서 KV cache pool을 확인합니다

### 이론

Model load 성공과 serving 가능은 다른 조건입니다. Weight와 runtime을 제외한 VRAM에 0보다 큰 KV cache pool을 만들 수 있어야 request를 처리할 수 있습니다.

### 실습

3B BF16 model을 CUDA로 이동합니다.

```bash
docker compose --profile tools run --rm model-loader python3 -m model_loader.load_3b
```

- 기대 결과: CUDA 이동 성공
- 저장 결과: `results/ch5-3b-bf16-load.json`
- 확인값: elapsed time, peak allocated VRAM, peak reserved VRAM

같은 model을 vLLM으로 기동하고 KV cache pool을 확인합니다.

```bash
docker compose --profile bf16 up -d vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile bf16 logs vllm-bf16 | grep -i "KV cache"
```

완료 조건:

- Health check 성공
- `Available KV cache memory`가 0보다 큼
- `GPU KV cache size`가 0보다 큼

다음 [KV cache 배치·시퀀스 실습](./03-kv-cache-batch-sequence.md)에서 pool 사용률을 metric으로 확인하고 동시 요청과 prompt 길이로 pool을 채웁니다.

참고자료:

- [Memory와 KV cache 이론](../02-ch5-theory.md)
- [GPU 실습 troubleshooting](../troubleshooting.md)
