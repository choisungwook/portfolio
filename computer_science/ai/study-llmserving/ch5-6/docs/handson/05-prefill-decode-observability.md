# TTFT와 TPOT만으로 prefill·decode 병목을 구분할 수 있을까

TTFT가 느리면 prefill 문제처럼 보이지만 scheduler queue가 원인일 수 있습니다. TPOT가 느려도 decode compute보다 KV cache pressure가 원인일 수 있습니다. 이 실습은 사용자 지표와 vLLM 내부 metric, GPU metric을 연결해 병목을 한 단계씩 좁힙니다.

## 실습 환경

- 선행 실습: [Static·dynamic·continuous 전략 비교](./04-batch-strategies.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- 이후 모든 명령: 위 workspace에서 실행
- runtime: vLLM `v0.27.1`
- model: `Qwen/Qwen2.5-3B-Instruct`

Repository root에서 workspace로 이동합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
```

## 두 workload가 다른 metric을 움직인다는 가설

- long-prefill
  - 조건: 긴 input, 짧은 output
  - 가설: Prefill p95와 TTFT 증가
- long-decode
  - 조건: 짧은 input, 긴 output
  - 가설: Decode p95, TPOT, KV cache usage 증가
- 고정 조건
  - 같은 BF16 model
  - 같은 scheduler 설정
  - 같은 GPU

Workload 외 조건을 고정해야 metric 차이를 prefill과 decode의 차이로 해석할 수 있습니다.

## Server와 metric target을 준비합니다

관측 stack과 BF16 server를 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
VLLM_MAX_NUM_SEQS=8 VLLM_MAX_NUM_BATCHED_TOKENS=4096 docker compose --profile bf16 up -d --force-recreate vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
```

Benchmark 전에 metric endpoint와 Prometheus target을 확인합니다.

```bash
curl http://127.0.0.1:8000/metrics
curl http://127.0.0.1:9090/api/v1/targets
```

## Long-prefill은 첫 token이 늦어진 이유를 보여줍니다

긴 input과 짧은 output workload를 실행합니다.

```bash
docker compose --profile tools run --rm -e MODEL_LABEL=bf16 -e PRECISION=BF16 -e VLLM_MAX_NUM_SEQS=8 -e VLLM_MAX_NUM_BATCHED_TOKENS=4096 benchmark python -m benchmark.benchmark_long_prefill
```

Grafana에서 다음 순서로 봅니다.

1. Queue p95로 scheduler 대기를 제외합니다.
2. Prefill p95로 prompt 계산 시간을 확인합니다.
3. TTFT p95로 사용자 첫 응답 지연과 연결합니다.
4. GPU utilization·power로 workload 강도를 확인합니다.
5. Peak VRAM으로 context가 memory에 미친 영향을 확인합니다.

TTFT만 증가하고 Queue p95가 안정적이라면 prefill 계산이 유력합니다. Queue와 TTFT가 함께 증가한다면 prompt 계산만의 문제로 단정할 수 없습니다.

## Long-decode는 token 생성 비용을 보여줍니다

짧은 input과 긴 output workload를 실행합니다.

```bash
docker compose --profile tools run --rm -e MODEL_LABEL=bf16 -e PRECISION=BF16 -e VLLM_MAX_NUM_SEQS=8 -e VLLM_MAX_NUM_BATCHED_TOKENS=4096 benchmark python -m benchmark.benchmark_long_decode
```

이번에는 다음 순서로 봅니다.

1. Decode p95로 output 생성 구간을 확인합니다.
2. TPOT p95로 token 사이 사용자 체감 속도를 확인합니다.
3. Output TPS로 GPU 전체 decode 처리량을 확인합니다.
4. running·waiting request로 scheduler 포화를 확인합니다.
5. KV cache usage와 VRAM으로 memory pressure를 확인합니다.

여기서 “TPOT가 낮으면 decode가 해결된 것 아닌가”라고 묻습니다. Concurrency가 낮을 때 TPOT가 좋아도 요청이 늘어 waiting queue가 쌓일 수 있습니다. TPOT와 Output TPS, waiting request를 함께 봐야 합니다.

## 같은 E2E latency라도 원인은 다릅니다

두 결과를 확인합니다.

```bash
ls results/performance-bf16-long-*.json
```

| Workload | 우선 확인 metric | 병목 가설 |
| --- | --- | --- |
| long-prefill | Queue·Prefill·TTFT p95 | scheduler 대기 또는 prompt 계산 |
| long-decode | Decode·TPOT·Output TPS | weight·KV cache data movement |

- Prefill p95와 TTFT 동반 증가: 긴 prompt 계산 비용
- Decode p95와 TPOT 동반 증가: 긴 output 생성 비용
- waiting request와 GPU utilization 동반 증가: serving capacity 포화 가능
- waiting request만 증가: scheduler·runtime 병목 추가 확인
- TPOT와 KV cache usage 동반 증가: decode concurrency와 memory pressure 확인

## 정리

실험이 끝나면 model server만 종료해 metric과 model cache를 유지합니다.

```bash
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

TTFT와 TPOT는 사용자가 겪은 결과를 알려 줍니다. Queue, prefill, decode, KV cache metric은 그 결과가 생긴 단계를 알려 줍니다. **병목은 단일 숫자가 아니라 서로 연결된 metric의 움직임으로 판단해야 합니다.**

## 참고자료

- [GPU 사용률이 높은데 LLM이 느릴 때 무엇을 봐야 할까](../prometheus.md)
- [vLLM Metrics](https://docs.vllm.ai/en/stable/usage/metrics/)
