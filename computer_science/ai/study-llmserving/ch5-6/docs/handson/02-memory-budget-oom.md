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

## 먼저 OOM 가설을 계산합니다

Memory budget과 roofline calculator로 실행 전 가설을 만듭니다.

```bash
docker compose --profile tools run --rm benchmark python -m calculators.memory_budget
docker compose --profile tools run --rm benchmark python -m calculators.roofline
```

| Precision | 7B weight 근사 | 16GB GPU에서의 가설 |
| --- | ---: | --- |
| BF16 | 약 14.2GiB | runtime·KV cache 여유 부족 |
| FP8·INT8 | 약 7.1GiB | 실행 가능하나 KV cache 검증 필요 |
| INT4 | 약 3.5GiB | batch·context 확장 여유 증가 |

여기서 “14.2GiB가 16GB보다 작으니 조금은 남지 않나”라고 묻기 쉽습니다. 남은 공간은 약 1.7GiB뿐이며 CUDA context, allocator, temporary tensor가 먼저 사용합니다. Model이 올라가더라도 request capacity는 거의 남지 않습니다.

## 7B BF16의 실패를 확인합니다

OOM 시점의 GPU memory를 함께 보기 위해 관측 stack을 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
```

의도적으로 7B BF16 model load를 시도합니다.

```bash
docker compose --profile tools run --rm model-loader python -m model_loader.load_7b_expect_oom
```

- 기대 결과: CUDA OOM
- 저장 결과: `results/ch5-7b-bf16-oom.json`
- OOM이 아닌 오류: network·model format·kernel 문제부터 해결

실패 자체가 목적은 아닙니다. 계산한 weight와 실제 GPU memory 사이에 runtime 비용이 존재한다는 가설이 맞는지 확인하는 단계입니다.

## 3B BF16에서 남는 공간을 확인합니다

같은 GPU에 더 작은 model을 올려 비교합니다.

```bash
docker compose --profile tools run --rm model-loader python -m model_loader.load_3b
```

- 기대 결과: model의 CUDA 이동 성공
- 저장 결과: `results/ch5-3b-bf16-load.json`
- 확인값: elapsed time, peak allocated VRAM, peak reserved VRAM
- Grafana: GPU VRAM panel

3B model이 올라갔다는 사실만으로 serving capacity가 결정되지는 않습니다. 남은 VRAM이 KV cache budget이 되고, batch size와 sequence length가 그 budget을 소비합니다.

## 판단

- 7B BF16 OOM: weight 외 runtime 공간까지 포함하면 16GB 초과
- 3B BF16 load 성공: request를 위한 KV cache 여유 확보
- Roofline 결과: long-prefill과 batch 1 decode의 병목 가설 분리

정리하면, “모델이 들어가는가”와 “요청을 처리할 수 있는가”는 다른 질문입니다. Serving에서는 weight를 뺀 나머지 VRAM이 실제 request capacity입니다.

## 참고자료

- [16GB GPU에 7B 모델이 올라가도 serving이 어려운 이유](../02-ch5-theory.md)
