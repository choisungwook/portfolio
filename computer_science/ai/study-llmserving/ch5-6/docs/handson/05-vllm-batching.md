# `vllm bench serve`로 batch 설정 비교

`vllm bench serve`는 vLLM에 포함된 online serving benchmark client입니다. 별도 Python 부하 생성 코드를 작성하지 않고 OpenAI-compatible endpoint를 측정합니다.

동작 원리:

1. `random` dataset loader가 tokenizer 기준으로 지정한 길이의 synthetic prompt를 생성
2. 준비 확인 request와 warm-up request를 먼저 전송하고 측정에서 제외
3. `--request-rate inf`이면 모든 request를 즉시 준비
4. `--max-concurrency`가 동시에 endpoint로 전송할 request 수를 제한
5. Streaming response에서 첫 token과 이후 token의 도착 시각을 기록
6. TTFT·TPOT·E2E percentile과 request·token throughput을 계산
7. 실행 option과 측정값을 JSON으로 저장

측정값의 의미:

- TTFT: request 전송부터 첫 token 도착까지의 시간. Server queue와 prefill 포함
- TPOT: 첫 token 이후 output token 한 개를 생성하는 평균 시간. Decode 속도 중심
- E2E: request 전송부터 마지막 token 도착까지의 전체 시간
- Request TPS: 초당 완료 request 수
- Output TPS: 초당 생성 output token 수

이 시나리오의 활용 방법:

- Server preset: latency·balanced·throughput 세 가지
- Workload: input 256 token, output 64 token, request 100개
- Client concurrency: 1·4·8
- Output 고정: `--ignore-eos`
- 재현성: concurrency 값을 seed로 사용
- 비교 지표: TTFT p95, TPOT p95, E2E p95, Request TPS, Output TPS

같은 concurrency는 모든 preset에서 같은 seed를 사용합니다. 서로 다른 concurrency는 seed를 바꿔 같은 server에서 이전 prompt의 prefix cache가 재사용되지 않게 합니다.

다음 시나리오를 순서대로 진행합니다.

1. Latency 우선 설정 측정
2. 균형 설정 측정
3. Throughput 우선 설정 측정
4. 세 결과에서 SLO를 만족하는 설정 선택

공통 환경:

- 선행 실습: [GPU roofline과 병목 재현](./04-roofline-bottleneck.md)
- LAN 접속 준비: [같은 Wi-Fi에서 LLM serving endpoint 접속](../03-setup-lan-access.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- Runtime: vLLM `v0.27.1`
- Model: `Qwen/Qwen2.5-3B-Instruct`
- 고정 조건: model, synthetic input·output length, request count, concurrency 1·4·8
- 측정 요청: concurrency마다 100개

Local client에서 GPU server 주소를 지정합니다.

```bash
export GPU_SERVER_IP="<GPU-SERVER-IP>"
```

비교 설정:

| 설정 | `max_num_seqs` | `max_num_batched_tokens` | 예상 trade-off |
| --- | ---: | ---: | --- |
| Latency 우선 | 1 | 512 | Queue 감소, throughput 제한 |
| 균형 | 4 | 2048 | 작은 concurrency와 token budget 수용 |
| Throughput 우선 | 8 | 4096 | 동시 처리 증가, queue·VRAM 증가 가능 |

## 측정 범위

`--request-rate inf`와 `--max-concurrency`를 함께 사용해 sequence slot이 계속 차는 closed-loop 부하를 만듭니다.

- 용도: 세 scheduler preset의 latency·throughput 상대 비교
- 측정: TTFT·TPOT·E2E p50/p95, Request TPS, Output TPS
- 장점: vLLM version과 함께 배포되는 benchmark client·결과 형식 사용
- 한계: 실제 request arrival rate에 대한 운영 capacity를 증명하지 않음
- 한계: 두 scheduler option을 동시에 바꾸므로 개별 option의 인과관계를 분리하지 않음

SLO 값과 target concurrency는 측정 전에 정합니다. 결과를 본 뒤 기준을 바꾸지 않습니다.

`random`은 실제 대화 dataset이 아닙니다. Prompt 내용이 아니라 input·output token 길이와 scheduler 설정의 영향을 통제하기 위한 synthetic dataset입니다.

운영 SLO를 검증할 때는 `--request-rate inf` 대신 예상 RPS를 지정하고, 실제 request trace 또는 대표 dataset으로 다시 측정합니다.

## 시나리오 1. Latency 우선 설정을 측정합니다

### 이론

`max_num_seqs`는 iteration에서 처리하는 sequence 상한이고, `max_num_batched_tokens`는 iteration의 token budget입니다. Sequence를 하나로 제한하면 경쟁은 줄지만 weight read를 공유하지 못해 처리량이 제한됩니다.

vLLM `v0.27.1`에는 고정 `max_delay_ms` serve option이 없습니다. Batch 대기는 Queue time, TTFT, E2E latency로 측정합니다.

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

GPU server에서 관측 stack과 latency 우선 server를 실행합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
VLLM_MAX_NUM_SEQS=1 VLLM_MAX_NUM_BATCHED_TOKENS=512 \
  docker compose --profile bf16 up -d --force-recreate vllm-bf16
```

Local client에서 준비 완료를 확인합니다.

```bash
bash scripts/wait_for_health.sh "http://${GPU_SERVER_IP}:8000/health"
```

GPU server에서 benchmark를 실행하고 server를 종료합니다. Bash와 Docker Compose만 사용하므로 Ubuntu에서도 같은 명령으로 실행됩니다.

```bash
for concurrency in 1 4 8; do
  docker compose --profile tools run --rm benchmark \
    vllm bench serve \
    --backend vllm \
    --base-url http://model-server:8000 \
    --model Qwen/Qwen2.5-3B-Instruct \
    --served-model-name qwen \
    --dataset-name random \
    --input-len 256 \
    --output-len 64 \
    --random-range-ratio 0 \
    --ignore-eos \
    --temperature 0 \
    --ready-check-timeout-sec 600 \
    --num-warmups 5 \
    --num-prompts 100 \
    --request-rate inf \
    --max-concurrency "${concurrency}" \
    --seed "${concurrency}" \
    --percentile-metrics ttft,tpot,e2el \
    --metric-percentiles 50,95 \
    --label bf16-seq1-tokens512 \
    --metadata precision=BF16 max_num_seqs=1 max_num_batched_tokens=512 \
    --save-result \
    --result-dir results/vllm-batching \
    --result-filename "bf16-seq1-tokens512-c${concurrency}.json"
done
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## 시나리오 2. 균형 설정을 측정합니다

### 이론

Sequence 4와 token budget 2048은 일부 data reuse를 허용하면서 과도한 queue 증가를 피하려는 중간값입니다.

### 실습

GPU server에서 균형 설정을 기동합니다.

```bash
VLLM_MAX_NUM_SEQS=4 VLLM_MAX_NUM_BATCHED_TOKENS=2048 \
  docker compose --profile bf16 up -d --force-recreate vllm-bf16
```

Local client에서 준비 완료를 확인합니다.

```bash
bash scripts/wait_for_health.sh "http://${GPU_SERVER_IP}:8000/health"
```

GPU server에서 같은 workload를 실행하고 server를 종료합니다.

```bash
for concurrency in 1 4 8; do
  docker compose --profile tools run --rm benchmark \
    vllm bench serve \
    --backend vllm \
    --base-url http://model-server:8000 \
    --model Qwen/Qwen2.5-3B-Instruct \
    --served-model-name qwen \
    --dataset-name random \
    --input-len 256 \
    --output-len 64 \
    --random-range-ratio 0 \
    --ignore-eos \
    --temperature 0 \
    --ready-check-timeout-sec 600 \
    --num-warmups 5 \
    --num-prompts 100 \
    --request-rate inf \
    --max-concurrency "${concurrency}" \
    --seed "${concurrency}" \
    --percentile-metrics ttft,tpot,e2el \
    --metric-percentiles 50,95 \
    --label bf16-seq4-tokens2048 \
    --metadata precision=BF16 max_num_seqs=4 max_num_batched_tokens=2048 \
    --save-result \
    --result-dir results/vllm-batching \
    --result-filename "bf16-seq4-tokens2048-c${concurrency}.json"
done
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## 시나리오 3. Throughput 우선 설정을 측정합니다

### 이론

더 큰 sequence와 token budget은 GPU data reuse를 늘릴 수 있습니다. Capacity를 넘으면 waiting request, KV cache 사용률, TTFT가 함께 증가합니다.

### 실습

GPU server에서 가장 큰 설정을 기동합니다.

```bash
VLLM_MAX_NUM_SEQS=8 VLLM_MAX_NUM_BATCHED_TOKENS=4096 \
  docker compose --profile bf16 up -d --force-recreate vllm-bf16
```

Local client에서 준비 완료를 확인합니다.

```bash
bash scripts/wait_for_health.sh "http://${GPU_SERVER_IP}:8000/health"
```

GPU server에서 동일 workload를 실행하고 server를 종료합니다.

```bash
for concurrency in 1 4 8; do
  docker compose --profile tools run --rm benchmark \
    vllm bench serve \
    --backend vllm \
    --base-url http://model-server:8000 \
    --model Qwen/Qwen2.5-3B-Instruct \
    --served-model-name qwen \
    --dataset-name random \
    --input-len 256 \
    --output-len 64 \
    --random-range-ratio 0 \
    --ignore-eos \
    --temperature 0 \
    --ready-check-timeout-sec 600 \
    --num-warmups 5 \
    --num-prompts 100 \
    --request-rate inf \
    --max-concurrency "${concurrency}" \
    --seed "${concurrency}" \
    --percentile-metrics ttft,tpot,e2el \
    --metric-percentiles 50,95 \
    --label bf16-seq8-tokens4096 \
    --metadata precision=BF16 max_num_seqs=8 max_num_batched_tokens=4096 \
    --save-result \
    --result-dir results/vllm-batching \
    --result-filename "bf16-seq8-tokens4096-c${concurrency}.json"
done
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

## 시나리오 4. Latency SLO를 만족하는 설정을 선택합니다

### 이론

가장 큰 batch가 항상 운영 capacity를 높이지는 않습니다. Queue와 E2E p95가 SLO를 넘으면 높은 throughput은 사용자 대기 증가의 결과일 수 있습니다. 이 실습 결과는 preset 후보를 고르는 근거이며, 최종 운영 capacity는 예상 request rate로 다시 검증합니다.

| 관찰 | 해석 |
| --- | --- |
| Output TPS 증가, Queue p95 허용 범위 | Batching 이득 있음 |
| Queue·E2E p95 증가, throughput 정체 | 설정이 너무 큼 |
| Waiting과 GPU utilization 증가 | GPU capacity 포화 가능 |
| Waiting 증가, GPU utilization 낮음 | Scheduler·runtime 추가 확인 |

### 실습

아홉 JSON을 하나의 표로 출력합니다.

```bash
jq -r -s '
  ["preset", "concurrency", "TTFT p50 ms", "TTFT p95 ms", "TPOT p95 ms", "E2E p95 ms", "Request/s", "Output token/s"],
  (.[] | [
    .label,
    .max_concurrency,
    .p50_ttft_ms,
    .p95_ttft_ms,
    .p95_tpot_ms,
    .p95_e2el_ms,
    .request_throughput,
    .output_throughput
  ])
  | @tsv
' results/vllm-batching/*.json | column -t -s "$(printf '\t')"
```

선택 기준:

1. TTFT와 E2E p95가 SLO를 만족하는 설정만 남김
2. 남은 설정 중 Output TPS가 가장 높은 값 선택
3. 같은 concurrency끼리 세 preset의 결과 비교

Local client에서 같은 시간 구간의 Grafana metric을 확인합니다.

```text
http://<GPU-SERVER-IP>:3000/d/llm-serving-ch5-6/llm-serving-chapter-5-6
```

참고자료:

- [vLLM v0.27.1 bench serve options](https://docs.vllm.ai/en/v0.27.1/cli/bench/serve/)
- [vLLM v0.27.1 serve options](https://docs.vllm.ai/en/v0.27.1/cli/serve/)
- [vLLM v0.27.1 metrics](https://docs.vllm.ai/en/v0.27.1/usage/metrics/)
