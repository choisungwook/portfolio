# GPU 사용률이 높은데 LLM이 느릴 때 무엇을 봐야 할까

GPU utilization이 90%인데 TTFT가 계속 늘어날 수 있습니다. 반대로 GPU가 한가해 보여도 request는 queue에 쌓일 수 있습니다. GPU 사용률 하나만으로는 request가 queue, prefill, decode 중 어디에서 막혔는지 알 수 없기 때문입니다.

**이 관측 환경의 목적은 vLLM application metric과 NVIDIA GPU metric을 같은 시간축에 놓고 병목의 원인을 좁히는 것입니다.**

## 무엇을 어떻게 수집하는가

```text
vLLM ── /metrics ──> Prometheus ──> Grafana
GPU ── DCGM Exporter /metrics ──> Prometheus ──> Grafana
                                      └──────> benchmark Peak VRAM
```

- 수집 방식: Prometheus pull
- 수집 주기: 5초
- 저장 위치: `prometheus-data` Docker volume
- 시각화: Grafana Prometheus datasource
- dashboard: `LLM serving / LLM Serving Chapter 5-6`

| Target | 수집 내용 | 수집 목적 |
| --- | --- | --- |
| `model-server:8000` | latency·throughput·scheduler·KV cache | serving 단계별 병목 확인 |
| `dcgm-exporter:9400` | VRAM·GPU utilization·power | application 결과와 hardware 상태 연결 |

한 번에 하나의 vLLM server만 `model-server` alias를 사용합니다. BF16·GPTQ·FP8을 동시에 비교하는 구조가 아니라, 실행 시간 구간별로 비교하는 구조입니다.

## 관측 환경 확인

Prometheus, Grafana, DCGM Exporter를 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
```

Prometheus가 두 target을 수집하는지 확인합니다.

```bash
curl http://127.0.0.1:9090/api/v1/targets
```

vLLM server를 실행한 뒤 application metric과 GPU metric을 직접 확인합니다.

```bash
curl http://127.0.0.1:8000/metrics
curl http://127.0.0.1:9400/metrics
```

- Prometheus: `http://127.0.0.1:9090`
- Grafana: `http://127.0.0.1:3000`
- Grafana 계정: `admin` / `admin`
- 기본 bind: `0.0.0.0`, 같은 LAN에서도 접근 가능
- 로컬 전용 bind: 실행 전에 `export LAN_BIND_ADDRESS=127.0.0.1`
- 같은 Wi-Fi의 다른 기기에서 접속: [LAN endpoint 설정](./03-setup-lan-access.md)

## Queue, prefill, decode를 먼저 분리합니다

E2E latency만 보면 느리다는 사실만 알 수 있습니다. 원인을 찾으려면 request lifecycle을 세 구간으로 나눠야 합니다.

| 단계 | Metric | 무엇을 수집하는가 | 무엇을 관찰하는가 |
| --- | --- | --- | --- |
| Queue | `vllm:request_queue_time_seconds_bucket` | scheduler 대기 시간 histogram | batch 설정·capacity 부족으로 생긴 Queue p95 |
| Prefill | `vllm:request_prefill_time_seconds_bucket` | prompt 처리 시간 histogram | long input이 TTFT에 미친 영향 |
| Decode | `vllm:request_decode_time_seconds_bucket` | output 생성 시간 histogram | long output이 TPOT에 미친 영향 |

여기서 보통 “TTFT만 보면 queue와 prefill을 함께 알 수 있지 않나”라고 묻습니다. TTFT는 두 시간을 합친 사용자 체감 지표입니다. Queue와 prefill histogram을 분리해야 scheduler 문제인지 prompt 계산 문제인지 구분할 수 있습니다.

## 사용자 경험과 처리량을 함께 봅니다

### Latency

- `vllm:time_to_first_token_seconds_bucket`
  - 의미: request 시작부터 첫 token까지
  - 목적: 사용자가 응답 시작을 기다린 시간 확인
  - 관찰: TTFT p95
- `vllm:request_time_per_output_token_seconds_bucket`
  - 의미: 첫 token 이후 output token당 시간
  - 목적: decode 생성 속도 확인
  - 관찰: TPOT p95
- `vllm:e2e_request_latency_seconds_bucket`
  - 의미: request 전체 latency
  - 목적: 사용자 관점의 완료 시간 확인
  - 관찰: E2E p95

### Throughput

- `vllm:request_success_total`
  - 의미: 성공한 request 누적 수
  - 목적: request throughput 계산
  - 관찰: 1분 rate 기반 RPS
- `vllm:generation_tokens_total`
  - 의미: 생성한 output token 누적 수
  - 목적: decode throughput 계산
  - 관찰: 1분 rate 기반 Output TPS

Batch 설정이 좋아졌다고 판단하려면 Output TPS만 오르는 것으로 부족합니다. Queue p95와 E2E p95가 SLO 안에 남아 있어야 합니다.

## Scheduler와 KV cache가 capacity를 설명합니다

- `vllm:num_requests_running`
  - 수집값: 실행 중인 request 수
  - 목적: scheduler의 동시 처리 수준 확인
  - 관찰: `max_num_seqs` 변경에 따른 active sequence 변화
- `vllm:num_requests_waiting`
  - 수집값: scheduler 대기 request 수
  - 목적: serving capacity 포화 확인
  - 관찰: queue time과 waiting request의 동반 증가
- `vllm:kv_cache_usage_perc`
  - 수집값: KV cache 사용률
  - 목적: context와 concurrency의 memory 영향 확인
  - 관찰: KV cache 포화와 waiting request의 관계
- `vllm:prefix_cache_hits_total`
  - 수집값: prefix cache hit 누적 수
  - 목적: prefill 재사용 효과 확인
  - 관찰: 동일 prefix 재요청의 hit 증가
- `vllm:prefix_cache_queries_total`
  - 수집값: prefix cache query 누적 수
  - 목적: hit rate 분모 제공
  - 관찰: `hits / queries` 기반 hit rate

Waiting request가 늘어도 원인은 하나가 아닙니다. KV cache usage와 GPU utilization을 함께 봐야 memory capacity 문제인지 compute 포화인지 좁힐 수 있습니다.

## GPU metric은 application metric의 근거가 됩니다

- `DCGM_FI_DEV_FB_USED`
  - 수집값: 사용 중인 framebuffer memory
  - 단위: MiB
  - 목적: weight·KV cache·runtime의 VRAM 사용량 확인
  - 관찰: model·concurrency·precision별 Peak VRAM
- `DCGM_FI_DEV_GPU_UTIL`
  - 수집값: GPU utilization
  - 단위: percent
  - 목적: GPU busy 비율 확인
  - 관찰: batch·prefill·decode별 utilization 변화
- `DCGM_FI_DEV_MEM_COPY_UTIL`
  - 수집값: memory interface가 read·write 중이던 시간 비율
  - 단위: percent
  - 목적: GPU utilization이 연산 때문인지 data 이동 때문인지 구분
  - 관찰: decode 위주 workload에서 GPU util과 함께 높게 유지되는지
- `DCGM_FI_DEV_POWER_USAGE`
  - 수집값: GPU power usage
  - 단위: watt
  - 목적: workload 강도와 전력 사용 연결
  - 관찰: batch·precision별 power pattern

GPU utilization이 높다고 compute-bound로 단정할 수는 없습니다. Memory access를 기다리는 동안에도 GPU가 busy로 보일 수 있습니다.

### MEM_COPY_UTIL을 겹쳐 봤지만 구분되지 않았습니다

`DCGM_FI_DEV_GPU_UTIL`은 "SM에 할 일이 배정된 시간 비율"이라 대기 중에도 올라갑니다. 그래서 `DCGM_FI_DEV_MEM_COPY_UTIL`을 겹치면 방향이 보일 것이라 기대하고 실제로 재봤습니다. 결과는 기대와 달랐습니다.

| 시나리오 | GPU util | Memory util |
| --- | ---: | ---: |
| decode 위주, batch 16 | 25% | 24% |
| prefill 위주, prompt 3584 | 100% | 96% |
| 혼합 | 100% | 96% |

**두 값이 거의 같이 움직입니다.** 연산 병목을 노린 prefill 시나리오에서도 memory util이 96%로 높게 나옵니다. 이 카드에서 `MEM_COPY_UTIL`은 `GPU_UTIL`과 사실상 중복이라, 이것만으로 병목을 가르면 안 됩니다.

이유는 지표의 정의에 있습니다. 둘 다 **"그 시간 동안 바빴는가"**를 재는 시간 비율이지 "대역폭의 몇 %를 썼는가"가 아닙니다. 후자를 재려면 `DCGM_FI_PROF_DRAM_ACTIVE` 같은 profiling 지표가 필요한데 GeForce 계열에는 노출되지 않습니다.

그래서 판별은 지표가 아니라 산수로 합니다. [roofline과 병목 재현](./handson/04-roofline-bottleneck.md)에서 하듯 **측정한 대역폭에서 나오는 이론 상한과 실제 token 생성 속도를 비교**합니다. 실측에서 batch 1 decode가 상한의 101%, batch 16에서도 96%로 나왔고, 이것이 대역폭 병목의 훨씬 확실한 증거입니다.

두 지표를 여전히 대시보드에 두는 이유는 세 번째 경우를 잡기 위해서입니다. 둘 다 낮으면 GPU가 노는 것이고, 그때는 client 동시성이나 queue를 봐야 합니다.

## Grafana에서는 질문별로 panel을 묶습니다

| 질문 | 확인할 panel | 판단 |
| --- | --- | --- |
| 첫 token이 왜 늦는가 | Queue·Prefill·TTFT p95 | scheduler 대기와 prompt 계산 분리 |
| 생성 속도가 왜 느린가 | Decode·TPOT p95·Output TPS | decode 병목 확인 |
| request가 왜 밀리는가 | Scheduler·KV Cache·GPU Utilization | compute·memory capacity 구분 |
| quantization이 이득인가 | VRAM·RPS·Output TPS·latency | memory 감소가 실제 성능으로 이어졌는지 확인 |
| prefix cache가 동작하는가 | Prefix Hit Rate·TTFT p95 | hit 증가와 첫 token 개선 연결 |

Histogram panel은 1분 window의 p95를 사용합니다. 짧은 benchmark는 값이 늦게 나타나거나 흔들릴 수 있으므로 benchmark 실행 시간 구간을 넉넉히 잡아 확인합니다.

## Batch 설정은 JSON과 시간 구간으로 연결합니다

vLLM metric에는 `max_num_seqs`와 `max_num_batched_tokens`가 비교용 label로 붙지 않습니다. 따라서 설정과 결과를 연결하는 방법을 따로 둡니다.

- 변경값: `VLLM_MAX_NUM_SEQS`, `VLLM_MAX_NUM_BATCHED_TOKENS`
- 실행 방식: 설정마다 vLLM server 재생성
- JSON 식별: `MODEL_LABEL`에 설정값 포함
- JSON 저장값: scheduler 설정·TTFT·TPOT·E2E·RPS·Output TPS·Peak VRAM
- Grafana 식별: 각 server가 실행된 시간 구간

Benchmark는 측정 시작부터 종료까지 Prometheus `/api/v1/query_range`를 호출해 `DCGM_FI_DEV_FB_USED`의 최댓값을 `peak_vram_mib`로 저장합니다. Prometheus 연결 실패나 series 부재 시 값은 `null`이지만 benchmark는 계속 진행합니다.

## Metric 조합으로 원인을 좁힙니다

- Queue p95와 Output TPS가 함께 증가
  - throughput을 얻는 대신 대기 시간이 증가한 설정
- Queue p95와 E2E p95만 증가
  - 처리량 이득 없이 queue만 늘어난 설정
- waiting request와 GPU utilization이 함께 증가
  - GPU serving capacity 포화 가능
- waiting request는 증가하지만 GPU utilization이 낮음
  - scheduler·request 공급·runtime 병목 가능
- Prefill p95와 TTFT가 함께 증가
  - 긴 input의 prefill 병목 가능
- Decode p95와 TPOT가 함께 증가
  - 긴 output의 decode 병목 가능
- TPOT와 KV cache usage가 함께 증가
  - decode concurrency와 memory pressure 확인 필요
- prefix hit rate가 낮음
  - prompt ordering·format·token sequence 불일치 가능
- quantization 후 VRAM만 감소
  - kernel 지원 또는 dequantization overhead 확인 필요

## 관측의 한계

- DCGM·Prometheus GPU interval: 1초
  - 1초보다 짧은 VRAM·utilization spike 누락 가능
- Grafana GPU panel: 최근 5초 최대값
  - 짧은 spike를 보존하지만 vLLM process allocator와 같은 순간값은 아님
- rate window: 1분
  - 짧은 benchmark에서 지연되거나 흔들리는 값
- Prometheus metric: aggregate
  - 개별 request trace와 prompt 내용은 제공하지 않음
- GPU query: 단일 GPU의 `max`
  - multi-GPU 비교에는 dashboard 변경 필요
- vLLM metric 이름
  - container image version 변경 시 query 재확인 필요

## 정리

GPU 사용률이 높다는 사실은 LLM이 왜 느린지 답하지 못합니다. Queue, prefill, decode를 나누고 scheduler·KV cache·GPU metric을 같은 시간축에서 연결해야 원인을 설명할 수 있습니다. **관측의 목표는 graph를 많이 만드는 것이 아니라, 느려진 단계를 한 단계씩 제외하는 것입니다.**

## 참고자료

- [GPU 실습 troubleshooting](./troubleshooting.md)
- [vLLM Metrics](https://docs.vllm.ai/en/stable/usage/metrics/)
- [Prometheus metric types](https://prometheus.io/docs/concepts/metric_types/)
- [NVIDIA DCGM Exporter](https://github.com/NVIDIA/dcgm-exporter)
