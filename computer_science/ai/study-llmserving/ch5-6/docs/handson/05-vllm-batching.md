# Batch를 키우면 throughput은 오르지만 latency도 좋아질까

Batch를 크게 잡으면 GPU가 여러 request를 함께 처리할 수 있습니다. 하지만 scheduler가 감당할 수 있는 token budget을 넘으면 waiting request와 TTFT가 늘어납니다. 이 실습은 가장 큰 batch가 아니라 latency SLO를 만족하는 가장 높은 throughput 설정을 찾습니다.

## 실습 환경

- 선행 실습: [내 GPU의 crossover를 직접 재고 병목을 일부러 만들기](./04-roofline-bottleneck.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- 이후 모든 명령: 위 workspace에서 실행
- runtime: vLLM `v0.27.1`
- model: `Qwen/Qwen2.5-3B-Instruct`

Repository root에서 workspace로 이동합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
```

## 실습 전 GPU process를 정리합니다

이전 실습과 다른 workload가 사용하는 GPU compute process를 정리합니다.

```bash
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

두 번째 명령이 process를 출력하면 실습을 진행하지 않습니다. [실행 주체 확인과 안전한 종료 절차](../troubleshooting.md#실습-전-gpu-기준-상태를-만듭니다)를 수행한 뒤 두 명령을 다시 실행합니다.

## 무엇을 바꾸고 무엇을 고정할까

vLLM continuous batching의 두 scheduler 제한값만 변경합니다.

| 설정 | `max_num_seqs` | `max_num_batched_tokens` | 예상 trade-off |
| --- | ---: | ---: | --- |
| Latency 우선 | 1 | 512 | queue 감소, throughput 제한 |
| 균형 | 4 | 2048 | 작은 concurrency와 token budget 수용 |
| Throughput 우선 | 8 | 4096 | 동시 처리 증가, queue·VRAM 증가 가능 |

- `max_num_seqs`: iteration에서 처리할 sequence 수의 상한
- `max_num_batched_tokens`: iteration 전체 token 수의 상한
- 고정 조건: model, prompt, output limit, concurrency 1·4·8

vLLM `v0.27.1`에는 고정 `max_delay_ms` serve option이 없습니다. 따라서 batch latency를 설정값으로 가정하지 않고 Queue time, TTFT, E2E latency로 측정합니다.

## 관측부터 시작합니다

세 설정을 같은 시간축에서 비교하기 위해 관측 stack을 먼저 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
```

## Latency 우선: sequence를 하나로 제한합니다

동시 실행을 제한한 기준점을 만듭니다.

```bash
VLLM_MAX_NUM_SEQS=1 VLLM_MAX_NUM_BATCHED_TOKENS=512 docker compose --profile bf16 up -d --force-recreate vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
```

설정값을 결과 JSON에도 기록하며 동일 workload를 실행합니다.

```bash
docker compose --profile tools run --rm -e MODEL_LABEL=bf16-seq1-tokens512 -e PRECISION=BF16 -e VLLM_MAX_NUM_SEQS=1 -e VLLM_MAX_NUM_BATCHED_TOKENS=512 benchmark python3 -m benchmark.benchmark_vllm_batching
```

다음 설정과 port·metric target이 겹치지 않도록 server를 종료합니다.

```bash
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## 균형: sequence 4와 token budget 2048을 허용합니다

같은 workload를 실행해 동시 처리 이득과 queue 증가를 비교합니다.

```bash
VLLM_MAX_NUM_SEQS=4 VLLM_MAX_NUM_BATCHED_TOKENS=2048 docker compose --profile bf16 up -d --force-recreate vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile tools run --rm -e MODEL_LABEL=bf16-seq4-tokens2048 -e PRECISION=BF16 -e VLLM_MAX_NUM_SEQS=4 -e VLLM_MAX_NUM_BATCHED_TOKENS=2048 benchmark python3 -m benchmark.benchmark_vllm_batching
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## Throughput 우선: sequence 8과 token budget 4096을 허용합니다

가장 큰 설정에서 throughput이 실제로 증가하는지 확인합니다.

```bash
VLLM_MAX_NUM_SEQS=8 VLLM_MAX_NUM_BATCHED_TOKENS=4096 docker compose --profile bf16 up -d --force-recreate vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
docker compose --profile tools run --rm -e MODEL_LABEL=bf16-seq8-tokens4096 -e PRECISION=BF16 -e VLLM_MAX_NUM_SEQS=8 -e VLLM_MAX_NUM_BATCHED_TOKENS=4096 benchmark python3 -m benchmark.benchmark_vllm_batching
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## 큰 설정이 좋은 설정인지 판정합니다

세 JSON을 하나의 표로 결합합니다.

```bash
ls results/performance-bf16-seq*-vllm-batching.json
docker compose --profile tools run --rm benchmark python3 -m benchmark.summary
```

| 관찰 | 의미 |
| --- | --- |
| Output TPS 증가 + Queue p95 허용 범위 | batching 이득 있음 |
| Queue·E2E p95 증가 + throughput 정체 | 설정이 너무 큼 |
| waiting request + GPU utilization 증가 | GPU capacity 포화 가능 |
| waiting request 증가 + GPU utilization 낮음 | scheduler·runtime 추가 확인 |

여기서 보통 “RPS가 가장 높은 설정을 고르면 되지 않나”라고 묻습니다. 사용자는 throughput이 아니라 자신의 latency를 경험합니다. TTFT·E2E SLO를 넘긴 throughput은 운영 capacity가 아니라 queue를 늘린 결과일 수 있습니다.

## 판단

- 세 설정의 JSON 생성
- concurrency 1·4·8의 p95 latency와 throughput 비교
- `results/summary.md`에서 scheduler 설정과 결과 연결
- latency SLO를 만족하는 설정 중 Output TPS가 가장 높은 값 선택

정리하면, batch를 키우는 목적은 request를 더 오래 기다리게 하는 것이 아니라 GPU data reuse를 높이는 것입니다. Queue 증가보다 throughput 이득이 클 때만 더 큰 설정이 의미가 있습니다.

## 참고자료

- [vLLM serve options](https://docs.vllm.ai/en/v0.27.0/cli/serve/)
- [vLLM Metrics](https://docs.vllm.ai/en/stable/usage/metrics/)
