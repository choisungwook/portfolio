# Static·dynamic·continuous admission 전략 비교

다음 시나리오를 순서대로 진행합니다.

1. Client admission과 vLLM scheduler의 범위 구분
2. Running·waiting metric으로 continuous scheduling 관찰
3. 같은 arrival stream으로 세 admission 전략 비교
4. Client 대기와 server 대기를 분리해 결과 해석

공통 환경:

- 선행 실습: [vLLM batch 설정 비교](./05-vllm-batching.md)
- LAN 접속 준비: [같은 Wi-Fi에서 LLM serving endpoint 접속](../03-setup-lan-access.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- Runtime: vLLM `v0.27.1`
- Model: `Qwen/Qwen2.5-3B-Instruct`
- Workload: output limit 32~256 token의 request 24개

Local client에서 GPU server 주소를 지정합니다.

```bash
export GPU_SERVER_IP="<GPU-SERVER-IP>"
```

## 시나리오 1. Client admission과 vLLM scheduler를 구분합니다

### 이론

vLLM online server는 iteration마다 running request와 waiting request에 token budget을 배분하는 continuous batching을 사용합니다. Static과 dynamic batching은 이 실습의 client-side admission 전략이며 vLLM serve option이 아닙니다.

| 전략 | Client admission | vLLM 내부 실행 | 예상 결과 |
| --- | --- | --- | --- |
| Static | 8개 전송 후 모두 끝날 때까지 다음 cohort 대기 | Continuous | 긴 request가 cohort barrier 지배 |
| Dynamic | 최대 8개 또는 20 ms 후 전송 | Continuous | 무한 대기 방지, admission delay 추가 |
| Continuous | 도착 즉시 전송하고 빈 slot 보충 | Continuous | Barrier 감소, slot 활용 증가 |

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

Compose가 vLLM에 전달하는 scheduler option을 확인합니다.

```bash
VLLM_MAX_NUM_SEQS=8 VLLM_MAX_NUM_BATCHED_TOKENS=4096 \
  docker compose --profile bf16 config vllm-bf16
```

확인값:

- `--max-num-seqs 8`: iteration의 sequence 상한
- `--max-num-batched-tokens 4096`: iteration의 token budget
- `--enable-chunked-prefill`: 긴 prefill을 token budget에 맞춰 분할

Benchmark의 `batch_size=8`은 client cohort 크기이고 `max_num_seqs=8`은 server의 running sequence 상한입니다.

## 시나리오 2. Continuous scheduling을 metric으로 관찰합니다

### 이론

짧은 request가 완료된 뒤 `num_requests_running`이 다시 채워지면 고정 cohort 전체를 기다리지 않고 빈 slot을 재사용한 것입니다. `num_requests_waiting`과 queue time은 admission이 server capacity를 넘었는지 보여 줍니다.

### 실습

GPU server에서 관측 stack과 server를 기동합니다.

```bash
docker compose --profile observability up -d prometheus grafana dcgm-exporter
VLLM_MAX_NUM_SEQS=8 VLLM_MAX_NUM_BATCHED_TOKENS=4096 \
  docker compose --profile bf16 up -d --force-recreate vllm-bf16
```

Local client에서 준비 상태와 scheduler metric을 확인합니다.

```bash
bash scripts/wait_for_health.sh "http://${GPU_SERVER_IP}:8000/health"
curl -s "http://${GPU_SERVER_IP}:8000/metrics" \
  | grep -E 'vllm:num_requests_(running|waiting)|vllm:request_queue_time_seconds'
```

| Metric | 의미 |
| --- | --- |
| `vllm:num_requests_running` | 현재 실행 batch에 포함된 request 수 |
| `vllm:num_requests_waiting` | Sequence·token·KV cache budget을 기다리는 request 수 |
| `vllm:request_queue_time_seconds` | vLLM 내부 admission 대기 시간 |

## 시나리오 3. 같은 arrival stream으로 세 전략을 비교합니다

### 이론

Output 길이가 다른 request를 사용해야 cohort barrier와 slot 재사용 차이가 드러납니다. Request 수가 적거나 길이가 비슷하면 전략 차이가 작을 수 있습니다.

고정 조건:

- Logical arrival interval: 5 ms
- Request count: 24
- Output limit: 32·48·64·96·128·192·224·256 token 반복
- Static batch size: 8
- Dynamic max batch size: 8
- Dynamic max delay: 20 ms
- Continuous max in-flight: 8

### 실습

세 admission 전략을 같은 server에서 순서대로 실행합니다.

```bash
docker compose --profile tools run --rm \
  -e MODEL_LABEL=bf16 \
  -e VLLM_MAX_NUM_SEQS=8 \
  -e VLLM_MAX_NUM_BATCHED_TOKENS=4096 \
  benchmark python3 -m benchmark.benchmark_batch_strategies
```

결과를 확인합니다.

```bash
cat results/batch-strategies-bf16.md
cat results/batch-strategies-bf16.json
```

- Markdown: 전략별 핵심 지표 비교
- JSON: dispatch plan, request별 arrival·admission·completion 순서

## 시나리오 4. Client 대기와 server 대기를 분리합니다

### 이론

`admission_p95_ms`는 client가 request를 보내기 전에 기다린 시간입니다. vLLM Queue p95는 server에 도착한 뒤 scheduler에서 기다린 시간입니다. 두 값을 분리해야 전략 차이와 server capacity 문제를 혼동하지 않습니다.

| 지표 | 확인 질문 |
| --- | --- |
| `admission_p95_ms` | Client batch가 전송을 얼마나 지연했는가 |
| `ttft_p95_ms` | Admission, queue, prefill을 거쳐 첫 token이 언제 나왔는가 |
| `e2e_p95_ms` | 긴 request의 barrier가 완료 시간에 영향을 줬는가 |
| `output_tps` | Barrier 감소가 token 처리량으로 이어졌는가 |
| `peak_vram_mib` | 동시 running request가 memory pressure를 높였는가 |
| `completion_order` | 빈 slot을 cohort barrier 없이 재사용했는가 |

### 실습

Local client에서 Grafana를 열고 결과 JSON과 같은 시간 구간을 비교합니다.

```text
http://<GPU-SERVER-IP>:3000/d/llm-serving-ch5-6/llm-serving-chapter-5-6
```

- Scheduler: 빈 running slot이 다시 채워지는지 확인
- Queue p95: server scheduler 대기 확인
- TTFT·E2E p95: 사용자 latency 확인
- KV Cache·GPU VRAM: concurrency의 memory 영향 확인
- GPU Utilization·Power: strategy별 idle 차이 확인

실험 후 model server를 종료합니다.

```bash
docker compose stop vllm-bf16
docker compose rm -f vllm-bf16
```

참고자료:

- [vLLM v0.27.1 scheduler](https://docs.vllm.ai/en/v0.27.1/api/vllm/v1/core/sched/scheduler/)
- [vLLM v0.27.1 serve options](https://docs.vllm.ai/en/v0.27.1/cli/serve/)
- [vLLM v0.27.1 metrics](https://docs.vllm.ai/en/v0.27.1/usage/metrics/)
