# Chapter 6 핸즈온

## 진행 순서

- 환경 준비: [01-setup.md](./01-setup.md)
- 목적: optimization 전후를 실제 model, request, metric으로 비교
- Ubuntu model: Qwen2.5-3B family
- macOS model: Qwen2.5-3B MLX variants
- Notebook과 simulation: 미사용

## 성능 지표

`TTOP` 대신 `TPOT`가 일반적인 명칭임. `ITL`과 비슷하지만 집계 방식 차이 존재 가능함.

| 지표 | 의미 | 낮을수록 좋은가 | 주로 보는 구간 |
| --- | --- | --- | --- |
| TTFT | request 시작부터 첫 token까지 | 예 | prefill·queue |
| TPOT | 첫 token 이후 output token 하나당 시간 | 예 | decode |
| E2E latency | request 시작부터 완료까지 | 예 | 전체 사용자 경험 |
| RPS | 초당 완료 request 수 | 아니오 | serving throughput |
| Output TPS | 초당 생성 token 수 | 아니오 | decode throughput |
| Peak VRAM | 측정 구간 최대 GPU memory | 상황별 | capacity |
| Accuracy | 정답 비율 | 아니오 | quality gate |

- percentile: p50과 p95 동시 기록
- benchmark warmup: 5 requests
- 측정: concurrency 1·4·8, 각 20 requests
- 비교 조건: 같은 prompt, output limit, GPU, runtime

## 1. Dynamic batching

### 확인할 가설

- `max batch size` 증가 시 실제 batch와 throughput 증가 가능
- `max delay` 증가 시 batch 형성 가능성이 커지지만 queue latency 증가
- 같은 설정도 request arrival pattern에 따라 결과 변화

### 실험 설정

차이를 쉽게 느낄 수 있는 3개 설정임.

| 설정 | Max batch | Max delay | 예상 |
| --- | ---: | ---: | --- |
| latency 우선 | 1 | 0ms | batch 없음, queue delay 최소 |
| 균형 | 4 | 20ms | 작은 batch와 제한된 대기 |
| throughput 우선 | 8 | 50ms | 큰 batch 가능, queue delay 증가 |

실제 `Qwen/Qwen2.5-0.5B-Instruct`의 `model.generate()`를 batch 단위로 호출함.

- warmup: 8 requests
- 측정: 40 requests
- concurrency: 16

### macOS Apple Silicon

첫 terminal에서 latency 우선 server를 실행함.

```bash
make mac-dynamic-up BATCH=1 DELAY_MS=0
```

두 번째 terminal에서 40 requests를 concurrency 16으로 전송함.

```bash
MODEL_BASE_URL=http://127.0.0.1:8000 uv run --group client python -m benchmark.benchmark_dynamic
```

server를 `Ctrl-C`로 종료한 뒤 균형 설정을 실행함.

```bash
make mac-dynamic-up BATCH=4 DELAY_MS=20
```

같은 client를 다시 실행함.

```bash
MODEL_BASE_URL=http://127.0.0.1:8000 uv run --group client python -m benchmark.benchmark_dynamic
```

Grafana가 필요하면 model server 실행 후 관측 container만 기동함.

```bash
docker compose --profile observability up -d prometheus grafana
```

### Ubuntu with RTX 5060

3개 설정을 순서대로 재기동하고 실제 load를 생성함.

```bash
make dynamic-matrix
```

결과 파일을 확인함.

```bash
ls results/dynamic-*.json
```

Grafana에서 다음 panel을 함께 확인함.

- `Dynamic Actual Batch Size`
- `Dynamic Queue Delay p95`
- `Dynamic E2E p95`
- `GPU Utilization`
- `GPU VRAM`

### 관찰

- `B1/D0`: average actual batch가 1에 가까움
- `B4/D20`: queue delay를 제한하면서 batch 형성
- `B8/D50`: arrival이 충분할 때 actual batch 증가
- Max batch 8인데 actual batch가 2: request arrival 또는 delay 부족
- Output TPS 증가 없이 latency만 증가: batch 설정 과대 가능

### 코드 10초 설명

- 첫 request부터 max delay timer 시작
- max batch 도달 또는 timer 만료 시 실제 batched generation 실행
- request마다 batch size, queue delay, E2E, token 수 기록

## 2. Continuous batching, Attention, PagedAttention

### 확인할 가설

- dynamic batching의 max delay와 vLLM continuous batching의 scheduler control은 다른 개념
- GQA와 PagedAttention이 KV cache capacity와 fragmentation을 줄임

### 실제 model 구조 확인

macOS에서 Hugging Face config를 읽음.

```bash
uv run --group dynamic python -m benchmark.model_config
```

Ubuntu에서 공통 image로 같은 config를 읽음.

```bash
docker compose --profile tools run --rm benchmark python -m benchmark.model_config
```

Qwen2.5-3B의 확인 대상임.

- attention heads: 16
- KV heads: 2
- attention: GQA
- query 8개가 KV head 하나 공유
- 같은 hidden dimension의 MHA보다 KV element 수 감소

### Ubuntu vLLM 실제 실행

BF16 server를 실행함.

```bash
make vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
```

짧은 실제 request로 endpoint를 확인함.

```bash
curl http://127.0.0.1:8000/v1/completions -H 'Content-Type: application/json' -d '{"model":"qwen","prompt":"Explain continuous batching in one sentence.","max_tokens":32,"temperature":0}'
```

Compose에 적용한 scheduler 설정임.

```text
--max-num-seqs 8
--max-num-batched-tokens 4096
--enable-chunked-prefill
--enable-prefix-caching
```

- `max_num_seqs`: 동시에 active 상태인 request 상한
- `max_num_batched_tokens`: iteration당 scheduler token budget
- `chunked prefill`: 긴 prefill을 decode와 interleave
- max delay: vLLM continuous batching의 대응 option 아님
- PagedAttention: vLLM KV block manager에서 실제 사용

Grafana에서 scheduler와 KV cache를 관찰함.

- `vLLM Scheduler`: running·waiting request
- `vLLM Cache`: KV cache usage와 prefix hit rate
- `vLLM TTFT p95`: prefill·queue 영향
- `vLLM TPOT p95`: decode 영향

### macOS 제한

- vLLM CUDA scheduler와 PagedAttention kernel: 실행 불가
- 대체: custom dynamic batching으로 batch formation 확인
- model architecture: 실제 Hugging Face config로 GQA 확인
- 개념을 simulation으로 대체하지 않음

### 코드 10초 설명

- model config에서 attention head와 KV head를 직접 읽음
- vLLM이 iteration마다 sequence와 token budget으로 work 선택
- KV cache는 fixed-size block으로 관리되어 variable-length waste 감소

## 3. Quantization 성능과 accuracy

### 확인할 가설

- W4A16: 작은 weight로 low-concurrency decode에 유리할 수 있음
- W8A8: weight와 activation compute 축소로 long prefill에 유리할 수 있음
- speedup과 accuracy를 같은 표에서 판단해야 함

### 비교 model

| Label | Model | Precision |
| --- | --- | --- |
| `bf16` | `Qwen/Qwen2.5-3B-Instruct` | BF16 |
| `gptq-int4` | `Qwen/Qwen2.5-3B-Instruct-GPTQ-Int4` | W4A16 |
| `fp8` | `RedHatAI/Qwen2.5-3B-Instruct-FP8-dynamic` | W8A8 |

### macOS Apple Silicon

MLX 3개 variant를 실제 load하고 동일 workload를 생성함.

```bash
make mac-benchmark
```

결과 파일임.

```text
results/macos-bf16.json
results/macos-8bit.json
results/macos-4bit.json
```

- workload: long-prefill, long-decode
- warmup: 1회
- 측정: 5회
- 지표: TTFT p50/p95, TPOT p50/p95, E2E p50/p95, Output TPS, peak memory
- RPS·concurrency: MLX single-process 비교 범위에서 제외

### Ubuntu 빠른 확인

BF16 server 하나만 먼저 확인함.

```bash
make vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
make smoke MODEL_LABEL=bf16
```

- model startup 시간: smoke 180초 제한에서 제외
- smoke: local fixed 20문항
- 예상 실행: 3분 미만
- timeout 또는 20문항 미완료: `N/A`

### Ubuntu 전체 성능 비교

3개 server를 한 번에 하나씩 실행하고 같은 workload를 측정함.

```bash
make quant-benchmark
```

각 model의 측정 순서임.

1. model load와 `/health` 완료
2. warmup 5 requests
3. concurrency 1·4·8 측정
4. concurrency마다 20 requests
5. long-prefill과 long-decode 분리
6. DCGM에서 측정 구간 Peak VRAM 조회
7. server 종료 후 다음 precision 실행

### Ubuntu accuracy 비교

같은 3개 model의 smoke와 GSM8K-20을 실행함.

```bash
make accuracy
```

이미 실행 중인 model 하나만 GSM8K-20으로 확인할 수도 있음.

```bash
make gsm8k MODEL_LABEL=bf16
```

GSM8K-20의 비교 조건임.

- official test set의 앞 20문항
- concurrency 4
- model warmup·startup 제외
- inference hard timeout 180초
- 세 variant가 동일 20문항을 모두 완료한 경우만 비교
- timeout·미완료: `N/A`
- full GSM8K: [06-gsm8k-deep-dive.md](./06-gsm8k-deep-dive.md)

### 최종 표

성능과 accuracy JSON을 결합함.

```bash
make summary
```

`results/summary.md`의 column임.

| Model | Precision | Workload | Concurrency | TTFT p50/p95 | TPOT p50/p95 | E2E p50/p95 | RPS | Output TPS | Peak VRAM | Smoke accuracy | GSM8K-20 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 실행 결과 | 실행 결과 | 실행 결과 | 실행 결과 | 실행 결과 | 실행 결과 | 실행 결과 | 실행 결과 | 실행 결과 | 실행 결과 | 실행 결과 | 실행 결과 |

### 결과 해석

- long-prefill TTFT·RPS: W8A8 효과 확인 지점
- long-decode TPOT·Output TPS: W4A16 효과 확인 지점
- Peak VRAM: concurrency 확장 여유 확인 지점
- accuracy 저하: 성능이 빨라도 채택 보류
- 예상과 다른 결과: RTX 5060 kernel support와 dequantization overhead 확인

### 코드 10초 설명

- streaming response의 첫 chunk로 TTFT 측정
- 남은 generation 시간을 token 수로 나누어 TPOT 계산
- fixed 20문항의 정확도와 DCGM peak VRAM을 성능 행에 결합

## 4. Prefix caching

### 확인할 가설

- 같은 token prefix의 두 번째 request는 TTFT 감소 가능
- 내용이 같아도 ordering이 바뀌면 cache hit 감소

### Ubuntu with RTX 5060

BF16 server와 prefix caching을 실행함.

```bash
make vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
make prefix-test
```

세 request를 순서대로 측정함.

1. 긴 static prefix의 cold request
2. 같은 static prefix의 warm request
3. 같은 내용을 재정렬한 request

결과를 확인함.

```bash
cat results/prefix-cache-bf16.json
```

Grafana의 `vLLM Cache` panel에서 prefix query와 hit ratio를 확인함.

### macOS 제한

- MLX server-level prefix cache 비교: 범위 제외
- string prefix simulation: 제외
- 실제 cache 효과는 Ubuntu vLLM에서만 측정

### 관찰

- warm TTFT < cold TTFT: prefix KV reuse 효과
- reordered TTFT 증가: token prefix 연속성 상실
- 차이가 작음: context 길이, 다른 cache hit, 측정 편차 확인
- production: tenant namespace와 cache-aware routing 추가 필요

### 코드 10초 설명

- 긴 prefix를 처음 요청해 KV block 생성
- 같은 token prefix로 두 번째 요청해 block 재사용
- ordering을 바꾼 요청으로 cache miss에 가까운 TTFT 비교

## 완료 기준

- max batch와 max delay가 latency·throughput에 미치는 영향 설명 가능
- dynamic batching과 continuous batching의 설정 차이 설명 가능
- TTFT, TPOT, E2E, RPS, Output TPS를 구분 가능
- W4A16과 W8A8 결과를 workload와 accuracy로 판단 가능
- prefix cache hit가 token ordering에 의존하는 이유 설명 가능
