# 같은 내용인데 prefix cache가 빗나가는 이유

System prompt와 document 내용이 같아도 순서나 whitespace가 달라지면 prefix cache hit가 사라질 수 있습니다. Prefix caching은 의미가 같은 문장을 찾는 기능이 아니라 앞부분의 동일한 token sequence를 재사용하기 때문입니다.

이 실습은 cold, warm, reordered request를 비교해 TTFT가 언제 줄어드는지 확인합니다.

## 실습 환경

- 선행 실습: [Prefill·decode 병목 관찰](./07-prefill-decode-observability.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- 이후 모든 명령: 위 workspace에서 실행
- model: `Qwen/Qwen2.5-3B-Instruct`

Repository root에서 workspace로 이동합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
```

## 실습 전 GPU process를 정리합니다

이전 실습과 다른 workload가 사용하는 GPU compute process를 정리합니다.

```bash
make gpu-reset
```

명령이 남은 process를 출력하고 실패하면 실습을 진행하지 않습니다. [실행 주체 확인과 안전한 종료 절차](../troubleshooting.md#실습-전-gpu-기준-상태를-만듭니다)를 수행한 뒤 `make gpu-reset`을 다시 실행합니다.

## 세 request가 확인하는 조건

1. Cold request
   - 긴 static prefix를 처음 계산
2. Warm request
   - 같은 token prefix를 다시 요청
   - KV cache 재사용 예상
3. Reordered request
   - 같은 내용을 다른 순서로 요청
   - token prefix 연속성 상실 예상

Semantic similarity가 아니라 token prefix가 비교 기준이라는 가설을 검증합니다.

## Prefix hit와 TTFT를 함께 측정합니다

관측 stack과 prefix caching이 활성화된 BF16 server를 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
docker compose --profile bf16 up -d vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
```

Cold, warm, reordered request를 순서대로 실행합니다.

```bash
docker compose --profile tools run --rm -e MODEL_LABEL=bf16 benchmark python3 -m benchmark.benchmark_prefix_cache
```

Request별 TTFT 결과를 확인합니다.

```bash
cat results/prefix-cache-bf16.json
```

Grafana에서는 다음 값을 같은 시간 구간에서 확인합니다.

- Prefix Cache Hit Rate: warm request의 hit 증가
- TTFT p95: cold와 warm의 첫 token 지연 차이
- KV Cache Usage: cache가 GPU memory에 미친 영향

여기서 “reordered request도 내용이 같으니 일부는 재사용하지 않나”라고 묻습니다. 앞에서부터 이어지는 공통 token까지만 재사용할 수 있습니다. 문서 순서가 초반에 달라지면 뒤의 동일 내용까지 prefix가 끊깁니다.

## Hit rate와 isolation 사이의 trade-off

- static content를 앞에 고정
  - 얻는 것: 긴 공통 prefix와 높은 hit 가능성
  - 주의점: dynamic content가 중간에 들어가면 이후 prefix 재사용 중단
- cache-aware routing
  - 얻는 것: 같은 cache가 있는 replica로 요청 전달
  - 주의점: replica load imbalance 가능
- tenant namespace 분리
  - 얻는 것: tenant 간 cache 정보 노출 방지
  - 잃는 것: shared cache hit 감소

Multi-tenant 환경에서는 hit rate보다 isolation이 우선입니다. Shared prefix의 latency 차이가 cache 존재 여부를 추정하는 side channel이 될 수 있습니다.

## 정리

실험이 끝나면 model server를 종료합니다.

```bash
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

Warm TTFT가 줄고 reordered TTFT가 다시 늘면 prefix caching이 token ordering에 의존한다는 가설을 확인한 것입니다. **Cache hit를 높이려면 같은 의미보다 같은 prompt 구조를 유지해야 합니다.**

## 참고자료

- [vLLM Automatic Prefix Caching](https://docs.vllm.ai/en/stable/features/automatic_prefix_caching.html)
