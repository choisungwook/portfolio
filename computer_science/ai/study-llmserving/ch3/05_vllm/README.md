# 05. vLLM으로 치환 (주제 5)

## 코드 설명 (10초)

> `serving_v4_vllm.py` 전체가 40줄이 안 된다.
> `LLM(model=..., max_num_seqs=..., gpu_memory_utilization=...)` 한 줄이 03·04번에서 손으로 만든 `WorkloadManager` + `ModelExecutor` + `ModelWorker`를 통째로 대체한다.
> 생성은 `generate(prompts, SamplingParams(...))` 한 번. batching·스케줄링·메모리 관리는 전부 vLLM 내부다.
> 다만 `max_num_seqs`(동시 처리 sequence 상한)는 **04번에서 만든 `batch_size`와 정확히 같은 개념**이다 — 원리를 알아야 이 값을 정할 수 있다.

## 환경별 경로

| | 방법 |
|---|---|
| **Ubuntu + RTX 5060** | library mode(`serving_v4_vllm.py`) + server mode(docker) 둘 다 |
| **MacBook M3** | vLLM arm64 wheel 없음 → **server mode를 Ubuntu에서 띄우고 Mac에서 클라이언트만** 실행. Ubuntu가 없으면 03번 `bench_batching.py` 결과와 비교하는 것으로 대체 |

---

## A. Ubuntu — library mode

```bash
uv sync --dev --extra gpu
uv run python -c "import vllm, torch; print(vllm.__version__, torch.version.cuda)"

MAX_NUM_SEQS=16 GPU_MEMORY_UTILIZATION=0.6 uv run python 05_vllm/serving_v4_vllm.py
```

```bash
curl -s -X POST http://localhost:8000/generate_vllm \
  -H 'Content-Type: application/json' \
  -d '{"prompts":["Hello, I am","The weather is","I want to"]}' | python -m json.tool
```

> RTX 5060(Blackwell, sm_120)에서 `no kernel image` 오류가 나면 torch가 cu128 빌드가 아닌 것.
> [Ubuntu RTX GPU 환경 준비](../01_setup/ubuntu_with_rtxgpu.md) 참고.

## B. Ubuntu — standalone server mode

```bash
docker compose --profile vllm up -d vllm
docker compose logs -f vllm     # "Application startup complete" 대기

curl -s http://localhost:8100/v1/models | python -m json.tool
curl -s -X POST http://localhost:8100/v1/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"facebook/opt-125m","prompt":"Hello, I am","max_tokens":20}' | python -m json.tool
```

## C. 비교 실행 (Mac에서도 가능)

우리 구현(03번 v2)과 vLLM 서버를 나란히 놓고 잰다.

```bash
# 터미널 1: 우리 구현
ENTRY=03_batching/serving_v2.py docker compose --profile cpu up -d serving

# 터미널 2 (Ubuntu): vLLM
docker compose --profile vllm up -d vllm

# 터미널 3: 비교
uv run python 05_vllm/compare_serving.py \
  --ours-url http://localhost:8000 \
  --vllm-url http://<ubuntu-ip>:8100 \
  --total 32
```

Ubuntu가 없으면 우리 구현만:

```bash
uv run python 05_vllm/compare_serving.py --ours-url http://localhost:8000 --vllm-url ""
```

## D. `max_num_seqs`를 바꿔가며 (핵심 실습)

```bash
for n in 1 4 16 64; do
  docker compose --profile vllm down
  docker compose --profile vllm run -d --service-ports vllm \
    --model facebook/opt-125m --max-num-seqs $n
  sleep 40
  echo "== max_num_seqs=$n"
  uv run python 05_vllm/compare_serving.py --ours-url "" --vllm-url http://localhost:8100 --total 64
done
```

HTTP 요청은 [05_vllm.http](./05_vllm.http)에서 실행한다.

## 관찰 포인트

1. 코드량: 우리 v3 약 250줄 → vLLM v4 약 40줄
2. 처리량: 같은 하드웨어에서 vLLM이 압도적. continuous batching + PagedAttention + KV cache 덕
3. `max_num_seqs`를 1로 낮추면 vLLM도 우리 구현 수준으로 내려감 → **framework가 마법이 아니라 설정이 일한다는 증거**
4. server mode는 `/v1/completions`, `/v1/chat/completions` 같은 OpenAI 호환 API를 그냥 제공 → k8s Deployment로 바로 뜰 수 있는 형태

## 퀴즈

- q9. "vLLM 쓰면 되니까 내부는 몰라도 된다"에 근거 2개로 반박하라.
  - 정답: `max_num_seqs` 같은 동시 처리 설정은 batching 원리를 알아야 조정할 수 있다. 성능과 메모리 문제도 continuous batching, PagedAttention, KV cache의 동작을 알아야 원인을 분석할 수 있다.
- library mode와 server mode 중 조직 상황에 맞는 방식을 고르는 기준은 무엇인가?
  - 정답: 여러 언어에서 사용하거나 model server를 독립적으로 배포·스케일링하려면 server mode가 적합하다. Python 애플리케이션에서 생성 실행 흐름을 직접 제어하려면 library mode가 적합하다.
