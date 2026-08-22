# Static·dynamic·continuous batching은 어디에서 성능 차이가 날까

Output 길이가 다른 request를 고정 batch로 묶으면 짧은 request가 끝나도 다음 batch는 시작하지 못합니다. Dynamic batching은 batch가 차거나 대기 시간이 끝날 때 보내고, continuous batching은 빈 sequence slot을 바로 채웁니다. 이 차이가 admission delay, TTFT, throughput을 어떻게 바꾸는지 확인합니다.

## 실습 환경

- 선행 실습: [vLLM scheduler 제한값 비교](./03-vllm-batching.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- 이후 모든 명령: 위 workspace에서 실행
- runtime: vLLM `v0.27.1`
- model: `Qwen/Qwen2.5-3B-Instruct`
- workload: output limit 32~256 token의 request 24개

Repository root에서 workspace로 이동합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
```

## 먼저 비교 범위를 구분합니다

vLLM online server의 내부 scheduler는 iteration마다 running request와 waiting request에 token budget을 배분하는 continuous batching 방식입니다. Static batching과 dynamic batching은 vLLM의 serve option이 아닙니다.

따라서 이 실습은 같은 vLLM server 앞에서 request admission 시점만 바꿉니다.

| 전략 | Client admission | vLLM 내부 실행 | 예상 결과 |
| --- | --- | --- | --- |
| Static | 8개가 모이면 전송하고 모두 끝날 때까지 다음 cohort 대기 | Continuous | 긴 request가 cohort barrier를 지배 |
| Dynamic | 최대 8개 또는 20ms가 되면 전송 | Continuous | 낮은 traffic의 무한 대기를 막지만 queue delay 추가 |
| Continuous | request 도착 즉시 전송하고 빈 slot을 보충 | Continuous | barrier 감소와 높은 slot 활용 |

이 결과를 “vLLM에 세 scheduler를 설치한 비교”로 해석하면 안 됩니다. 세 전략은 client-side admission 차이를 비교하고, 실제 GPU scheduling은 모두 같은 vLLM continuous scheduler가 수행합니다.

## vLLM의 batch 전략과 제한값을 확인합니다

Compose가 vLLM에 전달하는 scheduler option을 확인합니다.

```bash
VLLM_MAX_NUM_SEQS=8 VLLM_MAX_NUM_BATCHED_TOKENS=4096 docker compose --profile bf16 config vllm-bf16
```

확인할 command argument입니다.

- `--max-num-seqs 8`: 한 iteration에서 처리할 sequence 상한
- `--max-num-batched-tokens 4096`: 한 iteration의 token budget
- `--enable-chunked-prefill`: 긴 prefill을 token budget에 맞춰 분할

여기서 `batch_size=8`은 benchmark admission cohort 크기이고, `max_num_seqs=8`은 vLLM 내부 running sequence 상한입니다. 이름은 비슷하지만 적용 위치가 다릅니다.

## Running·waiting request로 continuous scheduling을 관찰합니다

관측 stack과 BF16 server를 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
VLLM_MAX_NUM_SEQS=8 VLLM_MAX_NUM_BATCHED_TOKENS=4096 docker compose --profile bf16 up -d --force-recreate vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
```

vLLM이 scheduler metric을 노출하는지 확인합니다.

```bash
curl http://127.0.0.1:8000/metrics | grep -E 'vllm:num_requests_(running|waiting)|vllm:request_queue_time_seconds'
```

- `num_requests_running`: 현재 iteration에서 실행 가능한 request
- `num_requests_waiting`: sequence·token·KV cache budget을 기다리는 request
- `request_queue_time_seconds`: vLLM 내부 admission 대기 시간

Benchmark 중 짧은 request가 완료된 뒤 running 수가 다시 채워지면 고정 cohort 전체를 기다리지 않고 빈 slot을 재사용하는 continuous scheduling을 관찰할 수 있습니다.

## 같은 arrival stream으로 세 전략을 비교합니다

Benchmark는 다음 조건을 고정합니다.

- logical arrival interval: 5ms
- request count: 24
- output limit: 32·48·64·96·128·192·224·256 token 반복
- static batch size: 8
- dynamic max batch size: 8
- dynamic max delay: 20ms
- continuous max in-flight: vLLM `max_num_seqs`와 같은 8

세 admission 전략을 한 번에 순서대로 실행합니다.

```bash
docker compose --profile tools run --rm -e MODEL_LABEL=bf16 -e VLLM_MAX_NUM_SEQS=8 -e VLLM_MAX_NUM_BATCHED_TOKENS=4096 benchmark python -m benchmark.benchmark_batch_strategies
```

결과를 확인합니다.

```bash
cat results/batch-strategies-bf16.md
cat results/batch-strategies-bf16.json
```

- Markdown: 전략별 핵심 성능 지표를 한 표로 비교
- JSON: dynamic dispatch plan, request별 arrival·admission·completion 순서 확인

## 어떤 숫자가 전략 차이를 설명할까

| 지표 | 질문 |
| --- | --- |
| `admission_p95_ms` | client 전략 때문에 request가 전송 전 얼마나 기다렸는가 |
| `ttft_p95_ms` | admission과 vLLM queue·prefill을 합쳐 첫 token이 언제 나왔는가 |
| `e2e_p95_ms` | 짧은 request가 긴 request의 barrier에 얼마나 영향받았는가 |
| `rps` | 전체 request를 초당 몇 개 완료했는가 |
| `output_tps` | output 길이가 다른 workload에서 token 처리량이 얼마인가 |
| `peak_vram_mib` | 동시 running request가 KV cache를 얼마나 사용했는가 |
| `completion_order` | 짧은 request 완료 뒤 새 request가 cohort barrier 없이 진행했는가 |

예상하는 상대적 패턴입니다.

- Static
  - cohort 안의 가장 긴 request가 다음 cohort 시작을 지연
  - admission p95와 E2E p95 증가 가능
- Dynamic
  - batch가 차지 않는 traffic도 20ms 뒤 dispatch
  - static barrier는 줄지만 max delay만큼 admission latency 추가
- Continuous
  - arrival 즉시 전송하고 완료 slot을 바로 보충
  - heterogeneous output에서 RPS·Output TPS 개선 가능
  - 부하가 capacity를 넘으면 vLLM queue time 증가

여기서 보통 “continuous 결과가 항상 가장 좋아야 하지 않나”라고 묻습니다. Request 수가 적거나 길이가 거의 같으면 static barrier 비용이 작습니다. 반대로 continuous admission은 concurrency와 KV cache usage를 높일 수 있습니다. 전략 차이는 반드시 heterogeneous workload와 실제 traffic arrival에서 측정해야 합니다.

## Grafana로 JSON의 원인을 확인합니다

- Scheduler: running slot이 비는 즉시 다시 채워지는지
- Queue p95: dynamic burst와 continuous admission이 server queue를 만드는지
- TTFT·E2E p95: client admission과 server queue가 사용자 latency로 이어지는지
- Output TPS: barrier 감소가 GPU throughput으로 이어지는지
- KV Cache·GPU VRAM: 더 높은 concurrency가 memory pressure를 만드는지
- GPU Utilization·Power: strategy별 GPU idle 차이

`admission_p95_ms`는 benchmark client가 기록하고, vLLM Queue p95는 Prometheus가 기록합니다. 두 값을 구분해야 client batch 대기와 server scheduler 대기를 혼동하지 않습니다.

## 정리

실험이 끝나면 model server만 종료합니다.

```bash
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

Static·dynamic·continuous batching의 차이는 batch라는 이름보다 request를 언제 admit하고 언제 빈 slot을 재사용하는지에 있습니다. **vLLM의 continuous batching은 고정 cohort의 가장 긴 request를 기다리지 않지만, 더 높은 concurrency가 queue와 KV cache pressure를 만들 수 있으므로 latency와 throughput을 함께 판단해야 합니다.**

## 참고자료

- [vLLM scheduler source documentation](https://docs.vllm.ai/en/v0.27.0/api/vllm/v1/core/sched/scheduler/)
- [vLLM serve options](https://docs.vllm.ai/en/v0.27.0/cli/serve/)
- [vLLM Metrics](https://docs.vllm.ai/en/stable/usage/metrics/)
