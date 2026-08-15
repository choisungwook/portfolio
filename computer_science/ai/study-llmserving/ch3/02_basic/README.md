# 02. 단일 요청 처리 (주제 1·2)

## 코드 설명 (10초)

> `serving_v1.py`는 6개 component 중 4개(API server / LLM engine / model executor / model worker)만 쓴 최소 구현이다.
> FastAPI가 prompt를 받고, `LLMEngine`이 `ModelExecutor`에 넘기고, `ModelExecutor`는 `mp.Queue` 두 개로 **별도 프로세스**의 `ModelWorker`에 일을 보낸다.
> worker는 프로세스 시작 때 model을 한 번 로드하고, 이후 `while True`로 큐를 지키며 요청마다 `model.generate()`를 돌린다.
> 핵심은 **model 실행이 웹 프로세스와 완전히 분리되어 있다**는 것 — GPU를 CPU 작업으로 기다리게 하지 않기 위한 구조다.

## 실행

## macOS Docker Compose

```bash
ENTRY=02_basic/serving_v1.py docker compose --profile cpu up -d serving
docker compose logs -f serving

uv run python 02_basic/client_v1.py --concurrency 8
```

## macOS 로컬 실행

```bash
uv run python 02_basic/serving_v1.py
uv run python 02_basic/client_v1.py --concurrency 8
```

## Ubuntu + RTX 5060

```bash
ENTRY=02_basic/serving_v1.py docker compose --profile gpu up -d serving-gpu
uv run python 02_basic/client_v1.py --concurrency 8

# GPU 사용률을 옆 터미널에서 관찰
watch -n 0.5 nvidia-smi
```

노트북에서는 [02_basic.ipynb](./02_basic.ipynb)의 구현 코드 셀을 위에서부터 직접 실행한다.

## 관찰 포인트

1. `ps -ef | grep serving_v1` → **프로세스가 2개**. 하나는 uvicorn, 하나는 model worker
2. `--concurrency`를 1 → 4 → 8로 올려도 **throughput이 거의 안 오름**
   - 이유: worker의 `while True` 루프가 요청을 **하나씩** 처리. 동시 요청은 큐에서 줄만 섬
3. Ubuntu에서 `nvidia-smi` → GPU 사용률이 **띄엄띄엄 튐**. 사이사이가 tokenize/HTTP 처리 시간
4. worker 프로세스만 `kill -9` → API는 살아 있지만 요청이 영원히 멈춤 (격리의 양면)

## 스스로 답해보기

- q2: process 격리의 **주된** 이유는 장애 격리인가 GPU 활용률인가?
- q3: 동시 100 요청에서 GPU가 노는 이유를 연산 관점에서 설명할 수 있나?
