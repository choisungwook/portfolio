# LLM serving이 느린 이유를 GPU에서 직접 확인하는 순서

옵션을 먼저 바꾸면 숫자는 달라져도 원인을 설명하기 어렵습니다. 이 핸즈온은 GPU 확인부터 시작해 memory, KV cache, roofline, scheduling, prefill·decode, quantization, cache 순서로 병목을 좁힙니다. 파일 번호가 학습 순서입니다.

## 모든 GPU 실습 전에 기준 상태를 만듭니다

Workspace의 이전 model process를 정리하고 hardware metric 수집 경로를 확인합니다.

```bash
make gpu-reset
make observability-check
```

Desktop GPU는 화면 출력 때문에 baseline VRAM이 0MiB가 아닙니다. 초기화 기준과 metric 불일치 판별은 [GPU 실습 troubleshooting](../troubleshooting.md)을 따릅니다.

## Chapter 5만 볼 때

Chapter 5는 "이 GPU에 이 model이 들어가는가, 느리다면 연산인가 대역폭인가"를 다룹니다. 이론을 먼저 읽고 세 실습을 순서대로 합니다.

| 순서 | 문서 | 답하는 질문 |
| ---: | --- | --- |
| 0 | [Chapter 5 이론](../02-ch5-theory.md) | weight 말고 무엇이 VRAM을 쓰는가 |
| 1 | [02 메모리 예산과 OOM](./02-memory-budget-oom.md) | 계산상 들어가는데 왜 OOM이 나는가 |
| 2 | [03 KV cache 배치·시퀀스](./03-kv-cache-batch-sequence.md) | 캐시할 토큰 개수를 어떻게 세고, 최대 배치는 무엇이 정하는가 |
| 3 | [04 roofline과 병목 재현](./04-roofline-bottleneck.md) | 연산집약도 축은 무엇이고, 병목이 연산인가 대역폭인가 |

03과 04는 `make ch5-kv-probe`, `make ch5-roofline`, `make ch5-bottleneck`으로 직접 측정합니다. 실행 전에 [01 GPU 환경](./01-gpu-environment.md)이 필요합니다.

## Chapter 6만 볼 때

Chapter 6는 "Chapter 5에서 찾은 병목마다 어떤 optimization이 붙는가"를 다룹니다.

| 순서 | 문서 | 답하는 질문 |
| ---: | --- | --- |
| 0 | [Chapter 6 이론](../04-ch6-theory.md) | optimization을 무엇을 기준으로 고르는가 |
| 1 | [05 batching](./05-vllm-batching.md) | batch를 키우면 latency도 좋아지는가 |
| 2 | [06 batching 전략](./06-batch-strategies.md) | static·dynamic·continuous는 어디서 갈리는가 |
| 3 | [07 prefill·decode 관측](./07-prefill-decode-observability.md) | 느린 단계가 prefill인가 decode인가 |
| 4 | [08 quantization](./08-quantization.md) | VRAM이 가장 적은 model이 가장 빠른가 |
| 5 | [09 prefix caching](./09-prefix-caching.md) | 같은 내용인데 cache가 왜 빗나가는가 |

품질 검증의 한계는 [GSM8K 20문항의 범위](../06-gsm8k-deep-dive.md)에 있습니다.

07은 Chapter 5의 병목 개념을 metric으로 관측해 Chapter 6 optimization과 연결합니다.

## 전체 순서

환경부터 순서대로 다 할 때의 번호 순입니다.

| # | 문서 | Chapter |
| ---: | --- | --- |
| 1 | [GPU가 보여도 container에서 못 쓰는 이유](./01-gpu-environment.md) | 환경 |
| 2 | [16GB GPU에서 7B BF16이 OOM 나는 이유](./02-memory-budget-oom.md) | 5 |
| 3 | [배치와 시퀀스를 흔들어 KV cache가 차는 과정](./03-kv-cache-batch-sequence.md) | 5 |
| 4 | [내 GPU의 crossover를 직접 재고 병목을 만들기](./04-roofline-bottleneck.md) | 5 |
| 5 | [Batch를 키우면 throughput과 latency가 어떻게 바뀌는가](./05-vllm-batching.md) | 6 |
| 6 | [Static·dynamic·continuous batching의 성능 차이](./06-batch-strategies.md) | 6 |
| 7 | [TTFT와 TPOT만으로 부족한 prefill·decode 병목](./07-prefill-decode-observability.md) | 5→6 |
| 8 | [VRAM이 줄었다고 빠른 model이 아닌 quantization](./08-quantization.md) | 6 |
| 9 | [같은 내용이어도 prefix cache가 빗나가는 조건](./09-prefix-caching.md) | 6 |

공통 metric의 수집 이유와 해석은 [GPU 사용률이 높은데 LLM이 느릴 때 무엇을 봐야 할까](../prometheus.md)에서 설명합니다.

## 참고자료

- [Chapter 5 이론](../02-ch5-theory.md)
- [Chapter 6 이론](../04-ch6-theory.md)
- [Quiz](../quiz.md)
