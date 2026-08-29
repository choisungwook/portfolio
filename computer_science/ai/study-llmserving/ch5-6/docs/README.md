# Chapter 5-6 문서 인덱스

이 디렉터리의 문서는 이론, 실습, 환경, 관측 네 갈래입니다. 파일 번호는 만든 순서라 chapter가 섞여 있으므로, chapter별로 볼 때는 아래 경로를 따릅니다.

## Chapter 5 — 이 GPU에 이 model이 들어가는가, 느리면 무엇 때문인가

| 순서 | 문서 | 답하는 질문 |
| ---: | --- | --- |
| 0 | [Chapter 5 이론](./02-ch5-theory.md) | weight 말고 무엇이 VRAM을 쓰는가 |
| 1 | [02 메모리 예산과 OOM](./handson/02-memory-budget-oom.md) | 계산상 들어가는데 왜 OOM이 나는가 |
| 2 | [09 KV cache 배치·시퀀스](./handson/09-kv-cache-batch-sequence.md) | 캐시할 토큰 개수를 어떻게 세고, 최대 배치는 무엇이 정하는가 |
| 3 | [08 roofline과 병목 재현](./handson/08-roofline-bottleneck.md) | 연산집약도 축은 무엇이고, 병목이 연산인가 대역폭인가 |

메모리 이야기(02 → 09)를 끝내고 속도 이야기(08)로 넘어가는 순서입니다. 08과 09는 `make ch5-roofline`, `make ch5-kv-probe`, `make ch5-bottleneck`으로 직접 측정합니다.

## Chapter 6 — 병목마다 어떤 optimization이 붙는가

| 순서 | 문서 | 답하는 질문 |
| ---: | --- | --- |
| 0 | [Chapter 6 이론](./04-ch6-theory.md) | optimization을 무엇을 기준으로 고르는가 |
| 1 | [03 batching](./handson/03-vllm-batching.md) | batch를 키우면 latency도 좋아지는가 |
| 2 | [04 batching 전략](./handson/04-batch-strategies.md) | static·dynamic·continuous는 어디서 갈리는가 |
| 3 | [06 quantization](./handson/06-quantization.md) | VRAM이 가장 적은 model이 가장 빠른가 |
| 4 | [07 prefix caching](./handson/07-prefix-caching.md) | 같은 내용인데 cache가 왜 빗나가는가 |

## 두 chapter를 잇는 실습

[05 prefill·decode 관측](./handson/05-prefill-decode-observability.md)은 Chapter 5의 병목 개념을 metric으로 보는 다리입니다. 어느 **단계**가 느린지까지 좁히고, 그 단계가 연산 때문인지 대역폭 때문인지는 08로 넘깁니다.

## 환경 준비

| 문서 | 하는 일 |
| --- | --- |
| [Ubuntu GPU 환경 준비](./01-setup-ubuntu.md) | driver, container toolkit, docker |
| [01 GPU 환경 확인](./handson/01-gpu-environment.md) | host와 container가 같은 GPU를 쓰는지 검증 |
| [LAN 접속](./03-setup-lan-access.md) | 같은 Wi-Fi에서 Grafana·vLLM·Prometheus 접속 |

## 관측과 복습

| 문서 | 하는 일 |
| --- | --- |
| [metric 해석](./prometheus.md) | 어떤 지표를 왜 모으고 어떻게 읽는가 |
| [GSM8K 20문항의 범위](./06-gsm8k-deep-dive.md) | 빠른 quality gate로 판단해도 되는 선 |
| [Quiz](./quiz.md) | Chapter 5·6 핵심 개념 복습 |

## 실습 전체 순서

번호대로 다 할 때의 순서와 chapter는 [실습 인덱스](./handson/)에 있습니다.
