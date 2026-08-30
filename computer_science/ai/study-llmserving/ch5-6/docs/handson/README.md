# LLM serving 병목을 재현하는 시나리오

다음 시나리오를 번호 순서대로 진행합니다.

1. Host부터 Grafana까지 GPU 관측 경로 확인
2. 7B BF16의 memory budget과 OOM 확인
3. Batch·sequence에 따른 KV cache 변화 확인
4. GPU roofline 측정과 병목 재현
5. Latency SLO를 만족하는 vLLM batch 설정 선택
6. Static·dynamic·continuous admission 전략 비교
7. Prefill·decode 병목 구분
8. BF16·W4A16·W8A8 비교
9. Prefix cache hit 조건 확인

모든 GPU 실습은 [Ubuntu GPU 환경 준비](../01-setup-ubuntu.md)를 완료한 뒤 실행합니다. GPU 기준 상태와 metric 불일치 판별은 [GPU 실습 troubleshooting](../troubleshooting.md)을 따릅니다.

## 시나리오 1. GPU 실행 경로와 metric 수집 경로를 확인합니다

### 이론

- Host driver, container runtime, DCGM Exporter, Prometheus, Grafana의 역할 구분
- 이후 OOM과 성능 결과를 해석할 hardware baseline 설정

### 실습

- [Host부터 Grafana까지 GPU 관측 경로 확인](./01-gpu-environment.md)

## 시나리오 2. Model load와 serving memory budget의 차이를 확인합니다

### 이론

- Weight 외 CUDA runtime, activation, allocator, KV cache가 사용하는 VRAM 확인
- Model load 성공과 API serving 가능 조건 구분

### 실습

- [16GB GPU에서 7B BF16 serving이 실패하는 이유](./02-memory-budget-oom.md)

## 시나리오 3. Batch와 sequence가 KV cache를 채우는 과정을 확인합니다

### 이론

- Attention 구조로 token당 KV cache 크기 계산
- Scheduler 제한과 KV cache 제한으로 최대 동시성 계산
- KV cache metric과 전체 GPU VRAM metric의 범위 구분

### 실습

- [배치와 시퀀스에 따라 KV cache가 차는 과정](./03-kv-cache-batch-sequence.md)

## 시나리오 4. Compute와 memory bandwidth 병목을 구분합니다

### 이론

- Arithmetic intensity와 hardware crossover 계산
- Batch 1 decode의 bandwidth 기반 token/s 상한 계산
- GPU utilization metric만으로 병목을 단정할 수 없는 이유 확인

### 실습

- [GPU roofline을 측정하고 병목 재현](./04-roofline-bottleneck.md)

## 시나리오 5. Latency SLO를 만족하는 batch 설정을 찾습니다

### 이론

- `max_num_seqs`와 `max_num_batched_tokens`의 역할 확인
- Throughput, Queue, TTFT, E2E latency의 trade-off 판단

### 실습

- [Latency SLO를 만족하는 vLLM batch 설정 찾기](./05-vllm-batching.md)

## 시나리오 6. Request admission 전략을 비교합니다

### 이론

- Client-side static·dynamic·continuous admission 구분
- vLLM 내부 continuous scheduler와 client admission의 범위 구분

### 실습

- [Static·dynamic·continuous admission 전략 비교](./06-batch-strategies.md)

## 시나리오 7. Prefill과 decode 지연 원인을 분리합니다

### 이론

- Queue·prefill·decode lifecycle metric 구분
- TTFT·TPOT와 server 내부 metric 연결

### 실습

- [Prefill과 decode 병목을 metric으로 구분](./07-prefill-decode-observability.md)

## 시나리오 8. Quantization을 성능과 품질로 평가합니다

### 이론

- W4A16과 W8A8이 줄이는 data와 유리한 workload 구분
- VRAM, latency, throughput, accuracy를 함께 사용한 선택 기준 설정

### 실습

- [BF16·W4A16·W8A8의 성능과 품질 비교](./08-quantization.md)

## 시나리오 9. Prefix cache hit 조건을 확인합니다

### 이론

- Semantic similarity와 동일 token prefix 구분
- Cache hit rate와 tenant isolation trade-off 확인

### 실습

- [Prefix cache가 hit하거나 빗나가는 조건](./09-prefix-caching.md)

관련 문서:

- [Memory와 roofline 이론](../02-ch5-theory.md)
- [LLM serving optimization 이론](../04-ch6-theory.md)
- [LLM serving metric 해석](../prometheus.md)
- [GSM8K 20문항 점수의 한계](../06-gsm8k-deep-dive.md)
- [Quiz](../quiz.md)
