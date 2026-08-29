# LLM serving이 느린 이유를 GPU에서 직접 확인하는 순서

옵션을 먼저 바꾸면 숫자는 달라져도 원인을 설명하기 어렵습니다. 이 핸즈온은 GPU 확인부터 시작해 memory, scheduling, prefill·decode, quantization, cache 순서로 병목을 좁힙니다.

파일 번호는 **만든 순서**이지 chapter 순서가 아닙니다. 그래서 chapter 별로 어디를 봐야 하는지 아래에 따로 적습니다.

## Chapter 5만 볼 때

Chapter 5는 "이 GPU에 이 model이 들어가는가, 느리다면 연산인가 대역폭인가"를 다룹니다. 이론을 먼저 읽고 세 실습을 순서대로 합니다.

| 순서 | 문서 | 답하는 질문 |
| ---: | --- | --- |
| 0 | [Chapter 5 이론](../02-ch5-theory.md) | weight 말고 무엇이 VRAM을 쓰는가 |
| 1 | [02 메모리 예산과 OOM](./02-memory-budget-oom.md) | 계산상 들어가는데 왜 OOM이 나는가 |
| 2 | [09 KV cache 배치·시퀀스](./09-kv-cache-batch-sequence.md) | 캐시할 토큰 개수를 어떻게 세고, 최대 배치는 무엇이 정하는가 |
| 3 | [08 roofline과 병목 재현](./08-roofline-bottleneck.md) | 연산집약도 축은 무엇이고, 병목이 연산인가 대역폭인가 |

08과 09는 `make ch5-roofline`, `make ch5-kv-probe`, `make ch5-bottleneck`으로 직접 측정합니다. 실행 전에 [01 GPU 환경](./01-gpu-environment.md)이 필요합니다.

## Chapter 6만 볼 때

Chapter 6는 "Chapter 5에서 찾은 병목마다 어떤 optimization이 붙는가"를 다룹니다.

| 순서 | 문서 | 답하는 질문 |
| ---: | --- | --- |
| 0 | [Chapter 6 이론](../04-ch6-theory.md) | optimization을 무엇을 기준으로 고르는가 |
| 1 | [03 batching](./03-vllm-batching.md) | batch를 키우면 latency도 좋아지는가 |
| 2 | [04 batching 전략](./04-batch-strategies.md) | static·dynamic·continuous는 어디서 갈리는가 |
| 3 | [06 quantization](./06-quantization.md) | VRAM이 가장 적은 model이 가장 빠른가 |
| 4 | [07 prefix caching](./07-prefix-caching.md) | 같은 내용인데 cache가 왜 빗나가는가 |

품질 검증의 한계는 [GSM8K 20문항의 범위](../06-gsm8k-deep-dive.md)에 있습니다.

## 두 chapter를 잇는 실습

[05 prefill·decode 관측](./05-prefill-decode-observability.md)은 Chapter 5의 병목 개념을 metric으로 보는 다리입니다. 어느 **단계**가 느린지까지 좁히고, 그 단계가 연산 때문인지 대역폭 때문인지는 08로 넘깁니다.

## 전체 순서

환경부터 순서대로 다 할 때의 번호 순입니다.

| # | 문서 | Chapter |
| ---: | --- | --- |
| 1 | [GPU가 보여도 container에서 못 쓰는 이유](./01-gpu-environment.md) | 환경 |
| 2 | [16GB GPU에서 7B BF16이 OOM 나는 이유](./02-memory-budget-oom.md) | 5 |
| 3 | [Batch를 키우면 throughput과 latency가 어떻게 바뀌는가](./03-vllm-batching.md) | 6 |
| 4 | [Static·dynamic·continuous batching의 성능 차이](./04-batch-strategies.md) | 6 |
| 5 | [TTFT와 TPOT만으로 부족한 prefill·decode 병목](./05-prefill-decode-observability.md) | 5→6 |
| 6 | [VRAM이 줄었다고 빠른 model이 아닌 quantization](./06-quantization.md) | 6 |
| 7 | [같은 내용이어도 prefix cache가 빗나가는 조건](./07-prefix-caching.md) | 6 |
| 8 | [내 GPU의 crossover를 직접 재고 병목을 만들기](./08-roofline-bottleneck.md) | 5 |
| 9 | [배치와 시퀀스를 흔들어 KV cache가 차는 과정](./09-kv-cache-batch-sequence.md) | 5 |

공통 metric의 수집 이유와 해석은 [GPU 사용률이 높은데 LLM이 느릴 때 무엇을 봐야 할까](../prometheus.md)에서 설명합니다.

## 참고자료

- [Chapter 5 이론](../02-ch5-theory.md)
- [Chapter 6 이론](../04-ch6-theory.md)
- [Quiz](../quiz.md)
