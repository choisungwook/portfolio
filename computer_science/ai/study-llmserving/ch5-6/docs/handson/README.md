# LLM serving이 느린 이유를 GPU에서 직접 확인하는 순서

옵션을 먼저 바꾸면 숫자는 달라져도 원인을 설명하기 어렵습니다. 이 핸즈온은 GPU 확인부터 시작해 memory, scheduling, prefill·decode, quantization, cache 순서로 병목을 좁힙니다.

1. [GPU가 보여도 container에서 못 쓰는 이유부터 확인](./01-gpu-environment.md)
2. [16GB GPU에서 7B BF16이 OOM 나는 이유 확인](./02-memory-budget-oom.md)
3. [Batch를 키우면 throughput과 latency가 어떻게 바뀌는지 비교](./03-vllm-batching.md)
4. [Static·dynamic·continuous batching의 성능 차이 확인](./04-batch-strategies.md)
5. [TTFT와 TPOT만으로 부족한 prefill·decode 병목 관찰](./05-prefill-decode-observability.md)
6. [VRAM이 줄었다고 빠른 model이 아닌 quantization 비교](./06-quantization.md)
7. [같은 내용이어도 prefix cache가 빗나가는 조건 확인](./07-prefix-caching.md)

공통 metric의 수집 이유와 해석은 [GPU 사용률이 높은데 LLM이 느릴 때 무엇을 봐야 할까](../prometheus.md)에서 설명합니다.

## 참고자료

- [Chapter 5 이론](../02-ch5-theory.md)
- [Chapter 6 이론](../04-ch6-theory.md)
