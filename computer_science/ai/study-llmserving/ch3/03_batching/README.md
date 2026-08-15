# 03. Batching과 Sequence 추적 (주제 3)

## 코드 설명 (10초)

> `serving_v2.py`의 핵심은 `Sequence`와 `WorkloadManager` 두 개다.
> prompt가 들어오면 UUID를 붙여 `Sequence` 객체로 감싸고 `incoming_queue`에 넣는다 — 이 순간부터 **web request와 model 실행이 분리**된다.
> `get_next_batch()`는 `active_sequences`가 `batch_size`(기본 4)에 찰 때까지 큐에서 꺼내 채우기만 한다. 비우는 건 결과를 받은 쪽 책임이다.
> 실행된 batch에는 **다른 요청의 prompt가 섞여 있을 수 있고**, 그래서 결과는 `request_id`로 원래 요청에 되매핑한다.
> `bench_batching.py`는 HTTP를 걷어내고 `model.generate()`만 batch size별로 돌려 순수 batching 효과를 잰다.

## 실행

## 1) 순수 batching 효과 측정

```bash
# Mac (CPU)
uv run python 03_batching/bench_batching.py --device cpu --total 32

# Ubuntu (GPU)
uv run python 03_batching/bench_batching.py --device cuda --total 64 --batch-sizes 1,2,4,8,16,32
```

출력 예 (수치는 환경마다 다름):

```
 batch  batches   wall(s)   prompt/s  speedup
     1       32     19.84       1.61    1.00x
     2       16     10.92       2.93    1.82x
     4        8      6.31       5.07    3.15x
     8        4      4.02       7.96    4.94x
    16        2      2.88      11.11    6.90x
```

## 2) 서비스로 확인

```bash
ENTRY=03_batching/serving_v2.py docker compose --profile cpu up -d serving   # Mac
# ENTRY=03_batching/serving_v2.py docker compose --profile gpu up -d serving-gpu   # Ubuntu

curl -s -X POST http://localhost:8000/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompts":["Hello, I am","The weather is","I want to","The best way to","The most efficient way to"]}' | python -m json.tool

curl -s http://localhost:8000/stats
```

## 3) batch size 바꿔가며

```bash
BATCH_SIZE=1 ENTRY=03_batching/serving_v2.py docker compose --profile cpu up -d --force-recreate serving
uv run python 02_basic/client_v1.py --url http://localhost:8000 --concurrency 8
```

HTTP 요청은 [03_batching.http](./03_batching.http)에서 실행한다.

## 관찰 포인트

1. **speedup이 batch size에 비례하지 않음** — 어느 지점부터 완만해짐. 그 지점이 하드웨어 포화점
2. prompt 5개 + `batch_size=4` → `/stats`의 `batches_executed`가 **2 증가**. 5개가 한 번에 안 들어감
3. batch 안에서 짧은 prompt가 긴 prompt를 **기다림** (padding + 동기화). 이게 latency 대가
4. `bench_batching.py`에 길이가 크게 다른 prompt를 섞어보면 padding 낭비가 커지는 걸 볼 수 있음

## 퀴즈

- q4. 다른 사용자의 prompt를 한 batch에 섞으려면 최소한 무엇을 더 들고 있어야 하나?
  - 정답: 각 prompt와 결과를 원래 요청에 연결할 `request_id`가 필요하다.
- q5. batching은 **누구의** latency를 희생해 전체 throughput을 사는가?
  - 정답: batch가 채워지길 기다리는 요청과 같은 batch에서 긴 prompt의 처리를 기다리는 짧은 요청의 latency를 희생한다.
- q10. `batch_size=4`, prompt 5개를 처리하려면 최소 몇 번의 batch 실행이 필요한가?
  - 정답: 2번이다. 첫 batch에서 4개, 두 번째 batch에서 1개를 처리한다.
