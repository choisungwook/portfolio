# LLM serving optimization은 왜 GPU 사양 확인부터 시작해야 할까

Batching과 quantization option부터 바꾸면 성능 숫자는 달라져도 이유를 설명하기 어렵습니다. Model이 VRAM을 어떻게 쓰고 prefill과 decode가 어디에서 막히는지 먼저 알아야 optimization 결과를 예측할 수 있습니다.

이 workspace는 RTX 5060 Ti 16GB에서 memory budget → KV cache → roofline → scheduling → observability → quantization → caching 순서로 가설을 검증합니다.

## 문서 인덱스

전체 문서 목록과 chapter별 경로는 [문서 인덱스](./docs/)에 있습니다. 실습만 볼 때는 [실습 인덱스](./docs/handson/)를 봅니다.

**Chapter 5만 볼 때는 이 순서입니다.**

| 순서 | 문서 | 답하는 질문 |
| ---: | --- | --- |
| 0 | [Chapter 5 이론](./docs/02-ch5-theory.md) | weight 말고 무엇이 VRAM을 쓰는가 |
| 1 | [02 메모리 예산과 OOM](./docs/handson/02-memory-budget-oom.md) | 계산상 들어가는데 왜 OOM이 나는가 |
| 2 | [03 KV cache 배치·시퀀스](./docs/handson/03-kv-cache-batch-sequence.md) | 캐시할 토큰 개수를 어떻게 세고 최대 배치는 무엇이 정하는가 |
| 3 | [04 roofline과 병목 재현](./docs/handson/04-roofline-bottleneck.md) | 연산집약도 축은 무엇이고 병목이 연산인가 대역폭인가 |

Chapter 6는 [Chapter 6 이론](./docs/04-ch6-theory.md) 다음에 실습 05부터 09까지 순서대로 진행합니다.

## 먼저 원리를 이해합니다

- [16GB GPU에 7B 모델이 올라가도 serving이 어려운 이유](./docs/02-ch5-theory.md)
  - weight 외 KV cache·activation·runtime overhead를 계산
  - prefill과 decode의 compute·memory 병목 구분
- [LLM serving optimization은 왜 하나의 옵션으로 끝나지 않을까](./docs/04-ch6-theory.md)
  - continuous batching·PagedAttention·quantization·prefix caching의 해결 대상 구분
  - latency·throughput·VRAM·accuracy trade-off 판단

Chapter 5는 hardware 용어 모음이 아닙니다. Chapter 6의 optimization을 왜 선택하는지 설명하기 위한 병목 판단의 기초입니다.

## GPU에서 가설을 검증합니다

- 환경 준비: [Ubuntu GPU 환경 준비](./docs/01-setup-ubuntu.md)
- LAN 접속: [같은 Wi-Fi에서 관측·추론 endpoint 접속](./docs/03-setup-lan-access.md)
- 전체 실습 순서: [LLM serving이 느린 이유를 GPU에서 직접 확인하는 순서](./docs/handson/)
- 관측 기준: [GPU 사용률이 높은데 LLM이 느릴 때 무엇을 봐야 할까](./docs/prometheus.md)

| 순서 | Ch | 질문 | 확인할 결과 |
| ---: | :-: | --- | --- |
| 1 | 환경 | Host와 container가 같은 GPU를 사용하는가 | GPU·driver·VRAM·Prometheus target |
| 2 | **5** | 7B BF16은 왜 16GB에서 serving을 시작하지 못하는가 | weight·runtime·KV pool budget |
| 3 | **5** | 배치와 시퀀스를 키우면 KV cache가 어떻게 차는가 | 예측 대비 실측 pool 점유율·running·waiting |
| 4 | **5** | 내 카드의 crossover는 몇 FLOPS/B인가 | 실측 peak TFLOPS·bandwidth·roofline 그래프 |
| 5 | 6 | Batch를 키우면 latency와 throughput이 어떻게 바뀌는가 | Queue·TTFT·E2E·Output TPS |
| 6 | 6 | Static·dynamic·continuous batching은 어떻게 다른가 | admission delay·TTFT·RPS |
| 7 | 5→6 | 느린 구간이 prefill인가 decode인가 | Prefill·Decode p95·TPOT·KV cache |
| 8 | 6 | W4A16과 W8A8 중 무엇이 workload에 맞는가 | 성능·Peak VRAM·accuracy |
| 9 | 6 | Prefix cache는 언제 TTFT를 줄이는가 | cold·warm·reordered request |

파일 번호가 학습 순서입니다. Chapter별 경로와 선행 실습은 [실습 인덱스](./docs/handson/)에 정리돼 있습니다.

## 빠른 quality gate의 범위를 구분합니다

- [GSM8K 20문항 점수만으로 quantization을 선택하면 안 되는 이유](./docs/06-gsm8k-deep-dive.md)
  - GSM8K-20은 큰 regression을 찾는 quick gate
  - production 채택에는 full evaluation과 domain dataset 필요
- [Quiz](./docs/quiz.md)
  - Chapter 5·6 핵심 개념 복습

여기서 중요한 것은 가장 빠른 model을 찾는 일이 아닙니다. 같은 workload에서 SLO와 quality를 만족하면서 GPU당 처리량을 높이는 설정을 찾는 일입니다.

## 정리

LLM serving optimization은 option 목록이 아니라 원인과 결과를 연결하는 과정입니다. Memory budget으로 실행 가능성을 확인하고, metric으로 병목을 나눈 뒤, 그 병목에 맞는 scheduling·quantization·cache를 적용해야 결과를 설명할 수 있습니다.

## 참고자료

- *Hands-On LLM Serving and Optimization*, Chapter 5–6
- 원본 예제: `llm-model-inference/ch06/quantization_3way_300.ipynb`
