# 04. Streaming with Batching (주제 4)

## 코드 설명 (10초)

> `serving_v3.py`에서 바뀐 건 네 가지다.
> ① `ModelWorker.generate_forward_batch()`가 `model.generate()` 대신 `model()` forward 한 번을 돌려 **토큰 1개만** 만든다.
> ② `LLMEngine`이 daemon thread에서 `requests_processing_loop()`를 상시 돌리며 batch를 계속 굴린다.
> ③ 요청마다 `asyncio.Queue`를 만들어 `Sequence`에 붙이고, `Sequence`는 **어느 event loop 소속인지**(`seq.loop`)도 같이 들고 있는다.
> ④ background thread는 `asyncio.run_coroutine_threadsafe(queue.put(token), seq.loop)`로 그 loop에 토큰을 밀어 넣고, 요청 쪽 `event_generator()`가 `await queue.get()`으로 받아 SSE로 흘린다.
> 완료된 sequence는 `active_sequences`에서 빠지고 대기 중 prompt가 그 자리를 채운다 — continuous batching의 원형이다.

## 실행

## Mac / Ubuntu 공통

```bash
ENTRY=04_streaming/serving_v3.py docker compose --profile cpu up -d serving      # Mac
# ENTRY=04_streaming/serving_v3.py docker compose --profile gpu up -d serving-gpu  # Ubuntu

# 단일 스트림 (curl로 raw SSE 확인)
curl -N -X POST http://localhost:8000/generate_stream \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Hello, I am"}'
```

## Table 3-1 재현 — 시차를 두고 4개 요청

터미널 1:

```bash
chmod +x 04_streaming/watch_batch.sh
./04_streaming/watch_batch.sh
```

터미널 2:

```bash
uv run python 04_streaming/client_stream.py --count 4 --stagger 1.0 --verbose
```

노트북에서는 [04_streaming.ipynb](./04_streaming.ipynb)의 토큰 단위 forward 코드를 직접 실행한다.

출력 예:

```
 req   TTFT(s)  total(s)  tokens   TPOT(s)  text
   A      0.31      4.82      20     0.237  ' a student at the university of'
   B      0.24      4.55      20     0.227  ' see a lot of people who'
   C      0.28      4.61      20     0.228  ' eat a lot of food and'
   D      0.26      4.50      20     0.224  ' success is to be a good'
```

## 관찰 포인트

1. `watch_batch.sh` 화면에서 **active 배열이 1→2→3→4로 늘었다가 완료 순서대로 줄어드는** 걸 볼 것
2. `--count 8 --stagger 0.5`로 올리면 `waiting`이 쌓임 → `batch_size=4` 상한에 걸림
3. **TTFT가 total보다 훨씬 작음**. 이게 streaming이 산 것
4. TPOT는 batch 안 요청 수가 늘어도 크게 안 나빠짐 → batching과 streaming이 공존한다는 증거
5. `BATCH_SIZE=1`로 재기동하면 요청들이 완전히 직렬화됨. TTFT가 뒤 요청부터 급등

## 코드 안의 함정 하나 (일부러 남긴 것)

```python
outputs = self.model(input_ids=..., attention_mask=..., use_cache=False)
```

- `use_cache=False` → **KV cache를 안 씀**. 매 토큰마다 전체 prompt를 처음부터 다시 계산
- 그리고 `sequence.prompt += token`으로 프롬프트가 계속 길어짐
- 즉 토큰이 늘수록 step 비용이 커짐. `--count 1`로 `MAX_TOKENS=60`을 주면 뒤로 갈수록 느려지는 게 보임
- **여기가 5·7장(KV cache 관리)이 들어올 자리**

## 스스로 답해보기

- q6: "전체 생성"과 "토큰 1개 생성"의 차이가 시스템 전체에 어떻게 파급되나?
- q7: background thread와 async event loop를 잇는 다리는 무엇인가? 왜 공유 변수로는 안 되나?
- q14: 완료 sequence 제거 코드가 왜 `get_next_batch()` 밖에 있나?
