# Prefix cache가 hit하거나 빗나가는 조건

다음 시나리오를 순서대로 진행합니다.

1. Cold·warm·reordered request의 prefix cache hit와 TTFT 비교
2. Cache hit rate와 tenant isolation의 trade-off 판단

공통 환경:

- 선행 실습: [Prefill·decode 병목 관측](./07-prefill-decode-observability.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- Model: `Qwen/Qwen2.5-3B-Instruct`
- Prefix caching: 활성화

## 시나리오 1. Token 순서가 cache hit와 TTFT를 바꾸는지 확인합니다

### 이론

Prefix caching은 의미가 같은 문장을 찾는 기능이 아닙니다. 앞에서부터 동일한 token sequence의 KV cache block을 재사용합니다.

| Request | 조건 | 예상 결과 |
| --- | --- | --- |
| Cold | 긴 static prefix를 처음 계산 | Cache miss, 높은 TTFT |
| Warm | 같은 token prefix를 다시 요청 | Cache hit, 낮은 TTFT |
| Reordered | 같은 내용을 다른 순서로 요청 | 공통 prefix 단절, TTFT 재증가 |

Whitespace나 document 순서가 달라져 token sequence가 바뀌면 뒤의 동일 내용도 재사용하지 못할 수 있습니다.

### 실습

Workspace로 이동하고 기존 GPU workload를 정리합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

두 번째 명령이 process를 출력하면 [실행 주체 확인과 안전한 종료 절차](../troubleshooting.md#실습-전-gpu-기준-상태를-만듭니다)를 수행합니다.

관측 stack과 prefix caching이 활성화된 server를 기동합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
docker compose --profile bf16 up -d vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
```

Cold, warm, reordered request를 순서대로 실행합니다.

```bash
docker compose --profile tools run --rm \
  -e MODEL_LABEL=bf16 \
  benchmark python3 -m benchmark.benchmark_prefix_cache
```

Request별 결과를 확인합니다.

```bash
cat results/prefix-cache-bf16.json
```

Grafana 확인값:

- Prefix Cache Hit Rate: warm request의 hit 증가
- TTFT p95: cold와 warm의 첫 token 지연 차이
- KV Cache Usage: cache block 점유율 변화

Warm TTFT가 줄고 reordered TTFT가 다시 늘면 token ordering 의존성을 확인한 것입니다.

## 시나리오 2. Cache hit rate와 tenant isolation을 함께 판단합니다

### 이론

| 설계 | 얻는 것 | 주의점 |
| --- | --- | --- |
| Static content를 앞에 고정 | 긴 공통 prefix, 높은 hit 가능성 | 중간의 dynamic content 뒤는 재사용 중단 |
| Cache-aware routing | Cache가 있는 replica에서 높은 hit | Replica load imbalance 가능 |
| Tenant namespace 분리 | Tenant 간 cache 정보 노출 방지 | Shared cache hit 감소 |

Multi-tenant 환경에서는 hit rate보다 isolation이 우선입니다. Shared prefix의 latency 차이가 cache 존재 여부를 추정하는 side channel이 될 수 있습니다.

### 실습

Prompt template과 routing 정책을 검토합니다.

- System prompt와 static document를 앞에 배치
- Request별 dynamic content를 뒤에 배치
- Tenant namespace 또는 cache key 분리 확인
- Cache-aware routing의 replica 편중 확인

실험 후 model server를 종료합니다.

```bash
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

참고자료:

- [vLLM Automatic Prefix Caching](https://docs.vllm.ai/en/v0.27.1/features/automatic_prefix_caching/)
