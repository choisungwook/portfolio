# VRAM이 가장 적은 quantization model이 가장 빠를까

W4A16은 weight를 크게 줄이고, W8A8은 activation compute까지 줄일 수 있습니다. 그렇다고 W4A16이 모든 decode에서, W8A8이 모든 prefill에서 빠르다고 단정할 수는 없습니다. Hardware kernel과 dequantization overhead, accuracy가 실제 선택을 바꿉니다.

이 실습은 BF16·W4A16·W8A8을 같은 workload에서 비교하고, 성능과 quality를 동시에 통과한 model만 선택합니다.

## 실습 환경

- 선행 실습: [Prefill·decode 병목 관찰](./07-prefill-decode-observability.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- 이후 모든 명령: 위 workspace에서 실행
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB

Repository root에서 workspace로 이동합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
```

## 세 model이 노리는 병목이 다릅니다

| Label | Model | Precision | 가설 |
| --- | --- | --- | --- |
| `bf16` | `Qwen/Qwen2.5-3B-Instruct` | BF16 | quality·성능 기준점 |
| `gptq-int4` | `Qwen/Qwen2.5-3B-Instruct-GPTQ-Int4` | W4A16 | weight bandwidth와 VRAM 감소 |
| `fp8` | `RedHatAI/Qwen2.5-3B-Instruct-FP8-dynamic` | W8A8 | long-prefill compute 감소 |

- 성능 workload: long-prefill·long-decode
- 빠른 quality gate: smoke 20문항
- reasoning quality gate: GSM8K 앞 20문항
- 비교 지표: TTFT·TPOT·RPS·Output TPS·Peak VRAM·accuracy

Peak VRAM을 비교하려면 `VLLM_GPU_MEMORY_UTILIZATION`을 세 설정에서 같게 두어야 합니다. 이 값이 KV pool 크기를 직접 정하기 때문에, 값이 다르면 quantization이 아니라 설정 차이를 재게 됩니다. 기본값 `0.85`를 그대로 쓰고 결과에 함께 기록합니다.

## BF16으로 기준점을 만듭니다

Quantization 결과를 해석하려면 같은 model family의 BF16 결과가 먼저 필요합니다.

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

## W4A16이 decode와 VRAM에 주는 이득을 확인합니다

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

W4A16의 우선 확인값은 Peak VRAM, long-decode TPOT, Output TPS입니다. VRAM만 줄고 TPOT가 개선되지 않으면 kernel 또는 dequantization overhead를 확인해야 합니다.

## W8A8이 prefill compute에 주는 이득을 확인합니다

FP8 model에도 같은 조건을 적용합니다.

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

W8A8의 우선 확인값은 long-prefill TTFT와 RPS입니다. Hardware가 FP8 path를 효율적으로 지원하지 않으면 낮은 precision이 성능 향상으로 이어지지 않을 수 있습니다.

## 가장 빠른 결과가 아니라 채택 가능한 결과를 고릅니다

성능과 quality 결과를 한 표로 결합합니다.

```bash
docker compose --profile tools run --rm benchmark python3 -m benchmark.summary
```

| 질문 | 판단 지표 |
| --- | --- |
| Long-prefill이 빨라졌는가 | TTFT·RPS |
| Long-decode가 빨라졌는가 | TPOT·Output TPS |
| 더 많은 request를 받을 여유가 생겼는가 | Peak VRAM |
| 출력 quality를 유지했는가 | Smoke·GSM8K-20 accuracy |

여기서 “accuracy가 같고 VRAM이 작으면 quantized model이 정답 아닌가”라고 묻습니다. 20문항 accuracy는 큰 regression을 찾는 quick gate일 뿐입니다. Production 채택에는 full evaluation과 domain dataset이 추가로 필요합니다.

## 정리

VRAM이 가장 적은 model이 반드시 가장 빠르지는 않습니다. W4A16과 W8A8은 줄이는 data와 유리한 workload가 다르고, 실제 speedup은 GPU kernel에 의존합니다. **Quantization은 precision 순위가 아니라 workload별 성능, memory, accuracy를 함께 통과시키는 선택입니다.**

## 참고자료

- [LLM serving optimization은 왜 하나의 옵션으로 끝나지 않을까](../04-ch6-theory.md)
- [GSM8K 20문항 점수의 한계](../06-gsm8k-deep-dive.md)
