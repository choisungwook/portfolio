# 06. Multi-Model Serving (주제 6)

## 코드 설명 (10초)

> 5개 component가 `app/` 아래 파일 하나씩에 대응한다.
> `store.py`가 model metadata(JSON)를 읽고, `engine.py`가 metadata의 `framework` 필드만 보고 알맞은 worker 클래스를 고른다 — **Factory 패턴**이라 새 framework 지원은 클래스 하나 추가로 끝난다.
> 심장은 `manager.py`의 `OrderedDict` LRU다. cache hit이면 `move_to_end`, 가득 찼으면 `popitem(last=False)`로 가장 오래 안 쓴 model을 축출한다.
> 이 실습의 목적은 **`max_models`를 줄였을 때 thrashing이 어떻게 cold start로 나타나는지**를 숫자로 보는 것이다.
> `worker.py`의 `TritonWorker`는 추론을 직접 하지 않는다. Triton의 management API로 load/unload만 하고 inference API로 요청을 넘기는 **wrapper**다.

---

## A. 자체 구현 파트 (Mac / Ubuntu 공통)

```bash
# 샘플 이미지 준비
mkdir -p 06_multimodel/samples
curl -L -o 06_multimodel/samples/cat.jpg \
  https://raw.githubusercontent.com/pytorch/hub/master/images/dog.jpg

# max_models=2 로 기동
MAX_MODELS=2 uv run python 06_multimodel/serve.py
# 또는 컨테이너로
# ENTRY=06_multimodel/serve.py docker compose --profile cpu up -d serving
```

```bash
curl -s http://localhost:8001/models | python -m json.tool
```

## LRU thrashing 실측

```bash
# max_models=2, model 3개를 라운드로빈 → 매번 miss
uv run python 06_multimodel/bench_lru.py --pattern round-robin --requests 18
```

```
  1  550e8400  COLD  acquire=3.842s
  2  6ba7b810  COLD  acquire=1.117s
  3  7c9e6679  COLD  acquire=2.401s
  4  550e8400  COLD  acquire=3.655s     ← 축출당해서 다시 로드
...
max_models     : 2
hit_rate       : 0.0
misses/evict   : 18 / 16
```

이제 서버를 `MAX_MODELS=3`으로 재기동하고 같은 명령:

```bash
kill %1
MAX_MODELS=3 uv run python 06_multimodel/serve.py
uv run python 06_multimodel/bench_lru.py --pattern round-robin --requests 18
# hit_rate 0.83 부근, cold start는 처음 3번뿐
```

편향된 트래픽도:

```bash
uv run python 06_multimodel/bench_lru.py --pattern skewed --requests 30
```

---

## B. Triton 파트 (**Ubuntu 전용**)

> `nvcr.io/nvidia/tritonserver` 이미지는 x86-64 전용이라 Apple Silicon에서 정상 동작하지 않음.
> Mac 사용자는 A파트까지 하고, Triton은 Ubuntu 머신에서 수행.

## B-1. model repository 준비

```bash
mkdir -p 06_multimodel/model_dir/densenet_onnx/1

git clone -b r25.02 --depth 1 https://github.com/triton-inference-server/server.git /tmp/triton-server
(cd /tmp/triton-server/docs/examples && ./fetch_models.sh)
cp -r /tmp/triton-server/docs/examples/model_repository/densenet_onnx/* \
  06_multimodel/model_dir/densenet_onnx/
```

디렉터리 구조:

```
model_dir/
└── densenet_onnx/
    ├── 1/
    │   └── model.onnx
    ├── config.pbtxt
    └── densenet_labels.txt
```

## B-2. Triton 기동 (explicit model control)

```bash
docker compose --profile triton up -d triton
docker compose logs -f triton

curl -s http://localhost:8011/v2/health/ready -o /dev/null -w '%{http_code}\n'   # 200
curl -s -X POST http://localhost:8009/v2/repository/index | python -m json.tool
```

> `--model-control-mode=explicit` 때문에 기동 시점에는 **어떤 model도 로드되지 않음**.
> load API를 호출해야 올라감 — 우리 `TritonWorker._load_model()`이 하는 일이 정확히 그것.

## B-3. 우리 서비스를 통해 Triton 호출

```bash
TRITON_URL=localhost:8009 MAX_MODELS=2 uv run python 06_multimodel/serve.py
uv run python 06_multimodel/triton_client.py --image 06_multimodel/samples/cat.jpg
```

옆 터미널에서 Triton이 실제로 load/unload되는지 확인:

```bash
watch -n 1 'curl -s -X POST http://localhost:8009/v2/repository/index | python3 -m json.tool'
```

- densenet 요청 → `"state": "READY"`
- 다른 model 2개를 연달아 호출해 densenet이 LRU 축출되면 → `"state": "UNAVAILABLE"`
- 즉 **우리 서비스의 cache 축출이 Triton 쪽 메모리 회수로 실제 이어짐** (`__del__`/`unload`)

---

## 관찰 포인트

HTTP 요청은 [06_multimodel.http](./06_multimodel.http)에서 실행한다.

1. `max_models`가 동시 사용 model 수보다 작으면 hit_rate가 0에 수렴 = **thrashing**
2. cold start 시간이 model마다 다름 (distilbert ≫ bert-tiny). 모델 크기가 곧 cold start 비용
3. `skewed` 패턴에서는 `max_models=2`로도 hit_rate가 꽤 나옴 → **트래픽 분포가 cache 크기 결정을 좌우**
4. Triton wrapper 패턴: 내 서비스는 cache·metadata·web만, 추론은 통째로 위임
5. `config.pbtxt`의 input/output 이름(`data_0`, `fc6_1`)이 클라이언트 코드에 그대로 나타남 → 계약(contract)

## 퀴즈

- q6. LRU eviction이 왜 필요한가?
  - 정답: 제한된 메모리에 모든 model을 올릴 수 없으므로 오래 사용하지 않은 model을 내려 새 model의 공간을 확보해야 한다.
- q7. Triton의 두 API 종류와 각각의 역할은 무엇인가?
  - 정답: management API는 model을 load·unload하고 상태를 관리한다. inference API는 입력을 전달하고 추론 결과를 받는다.
- q9. `max_models=2`에 3개 model의 균등 트래픽이 들어오면 무슨 일이 생기는가?
  - 정답: 매 요청마다 필요한 model이 직전에 축출된 상태가 되어 miss와 재로딩이 반복된다. hit rate가 0에 수렴하고 cold start latency가 계속 발생한다.
- q12. 고객사 1,000곳의 model 중 200개가 동시에 사용될 때 첫 요청 UX를 어떻게 완화하는가?
  - 정답: 최근 사용량이나 예약·예측 정보를 기준으로 활성 model을 미리 load한다. 나머지는 비동기 load 상태와 재시도 안내를 제공하고, 자주 쓰는 model은 eviction 대상에서 보호한다.
