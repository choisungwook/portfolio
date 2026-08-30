# 16GB GPU에서 7B BF16이 OOM 나는 이유를 직접 확인합니다

7B BF16 weight는 약 14.2GiB라서 16GB GPU에 들어갈 것처럼 보입니다. 실제 model load에는 runtime overhead가 필요하고, serving에는 KV cache까지 필요합니다. 이 실습은 계산상 여유가 왜 실제 여유가 아닌지 확인합니다.

## 실습 환경

- 선행 실습: [GPU가 보여도 container에서 못 쓰는 이유](./01-gpu-environment.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- 이후 모든 명령: 위 workspace에서 실행
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB

Repository root에서 workspace로 이동합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
```

이전 model process를 정리하고 OOM 순간의 hardware metric이 수집되는지 확인합니다.

```bash
make gpu-reset
make observability-check
```

Desktop baseline VRAM과 Grafana 값이 예상과 다르면 [GPU 실습 troubleshooting](../troubleshooting.md)부터 확인합니다.

## 먼저 OOM 가설을 계산합니다

Memory budget과 roofline calculator로 실행 전 가설을 만듭니다.

```bash
docker compose --profile tools run --rm benchmark python3 -m calculators.memory_budget
docker compose --profile tools run --rm benchmark python3 -m calculators.roofline
```

| Precision | 7B weight 근사 | 16GB GPU에서의 가설 |
| --- | ---: | --- |
| BF16 | 약 14.2GiB | runtime·KV cache 여유 부족 |
| FP8·INT8 | 약 7.1GiB | 실행 가능하나 KV cache 검증 필요 |
| INT4 | 약 3.5GiB | batch·context 확장 여유 증가 |

여기서 “14.2GiB가 16GB보다 작으니 조금은 남지 않나”라고 묻기 쉽습니다. 남은 공간은 약 1.7GiB뿐이며 CUDA context, allocator, temporary tensor가 먼저 사용합니다. Model이 올라가더라도 request capacity는 거의 남지 않습니다.

같은 명령이 attention 구조별 KV 비용도 함께 출력합니다. 같은 16GB에서 4096-token 요청을 몇 개나 받을 수 있는지가 여기서 갈립니다.

| Model | attention | KV heads | KV/token | 요청 수 |
| --- | --- | ---: | ---: | ---: |
| Llama-2-7B | MHA | 32 | 512 KiB | 0 |
| Qwen2.5-7B | GQA | 4 | 56 KiB | 1 |
| Qwen2.5-3B | GQA | 2 | 36 KiB | 61 |

**KV 용량은 parameter 수가 아니라 KV head 수가 정합니다.** 이 계산을 실제 vLLM이 잡는 KV pool과 맞춰보는 것은 [배치와 시퀀스 스윕](./03-kv-cache-batch-sequence.md)에서 합니다.

`calculators.roofline`은 같은 workload가 카드에 따라 compute-bound인지 bandwidth-bound인지 다르게 판정되는 것을 보여줍니다. 축을 읽는 법과 이 카드의 실측 crossover는 [roofline과 병목 재현](./04-roofline-bottleneck.md)에 있습니다.

## 7B BF16의 실패를 확인합니다

OOM 시점의 GPU memory를 함께 보기 위해 관측 stack을 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
```

의도적으로 7B BF16 model load를 시도합니다.

```bash
docker compose --profile tools run --rm model-loader python3 -m model_loader.load_7b_expect_oom
```

- 기대 결과: CUDA OOM
- 저장 결과: `results/ch5-7b-bf16-oom.json`
- OOM이 아닌 오류: network·model format·kernel 문제부터 해결

실패 자체가 목적은 아닙니다. 계산한 weight와 실제 GPU memory 사이에 runtime 비용이 존재한다는 가설이 맞는지 확인하는 단계입니다.

## 같은 7B BF16을 vLLM으로 기동합니다

앞의 실험은 model을 CUDA로 옮기는 데 필요한 memory만 확인했습니다. Serving engine은 model 외에도 activation을 profiling하고 KV cache pool을 확보해야 합니다.

동시 sequence를 하나로 제한한 가장 작은 serving 설정으로 vLLM 기동을 시도합니다.

```bash
docker compose --profile oom run --rm vllm-7b-bf16-expect-failure
```

- 기대 결과: API server가 준비되기 전에 GPU memory 부족으로 종료
- memory 부족의 형태: CUDA OOM 또는 KV cache pool을 만들 수 없다는 초기화 오류
- OOM이 아닌 오류: network·model format·kernel 문제부터 해결

요청을 보내 KV cache를 채운 뒤 OOM을 만드는 실험이 아닙니다. vLLM은 기동할 때 KV pool을 미리 확보하고, 실행 중에는 pool을 넘는 요청을 대기시키거나 preemption합니다. **7B BF16은 요청을 받기 전에 serving 작업 공간부터 확보하지 못한다는 것이 이 단계의 결론입니다.**

## 3B BF16에서 남는 공간을 확인합니다

같은 GPU에 더 작은 model을 올려 비교합니다.

```bash
docker compose --profile tools run --rm model-loader python3 -m model_loader.load_3b
```

- 기대 결과: model의 CUDA 이동 성공
- 저장 결과: `results/ch5-3b-bf16-load.json`
- 확인값: elapsed time, peak allocated VRAM, peak reserved VRAM
- Grafana: GPU VRAM panel

3B model이 올라갔다는 사실만으로 serving capacity가 결정되지는 않습니다. 남은 VRAM이 KV cache budget이 되고, batch size와 sequence length가 그 budget을 소비합니다.

## 3B BF16은 vLLM serving까지 기동합니다

같은 serving 설정에서 model만 3B로 바꿔 API server와 KV pool이 준비되는지 확인합니다.

```bash
make vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile bf16 logs vllm-bf16 | grep -i "KV cache"
```

- 기대 결과: health check 성공
- vLLM log: 0보다 큰 `Available KV cache memory`와 `GPU KV cache size`
- 의미: weight와 runtime을 제외하고도 실제 요청을 저장할 KV pool 확보

여기까지는 KV pool이 생겼다는 사실만 확인합니다. 다음 [KV cache 배치·시퀀스 실습](./03-kv-cache-batch-sequence.md)에서 token당 KV 비용을 계산하고, 동시 요청 수와 prompt 길이로 pool을 직접 채웁니다.

## 판단

- 7B BF16 OOM: weight 외 runtime 공간까지 포함하면 16GB 초과
- 7B BF16 vLLM 실패: KV pool을 포함한 serving 작업 공간 확보 불가
- 3B BF16 load 성공: request를 위한 KV cache 여유 확보
- 3B BF16 vLLM 성공: API server와 KV pool 준비 완료
- Roofline 결과: long-prefill과 batch 1 decode의 병목 가설 분리

정리하면, “모델이 들어가는가”와 “요청을 처리할 수 있는가”는 다른 질문입니다. Serving에서는 weight를 뺀 나머지 VRAM이 실제 request capacity이고, vLLM은 그 공간을 기동할 때 KV pool로 확보합니다.

## 참고자료

- [16GB GPU에 7B 모델이 올라가도 serving이 어려운 이유](../02-ch5-theory.md)
- [GPU 실습 troubleshooting](../troubleshooting.md)
