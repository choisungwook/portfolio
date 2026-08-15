"""Build notebooks that expose and execute the hands-on Python code directly."""

import json
from hashlib import sha1
from pathlib import Path
from typing import Any

BASE = Path(__file__).parent


def markdown_cell(source: str) -> dict[str, Any]:
  return {
    "cell_type": "markdown",
    "id": sha1(f"markdown:{source}".encode(), usedforsecurity=False).hexdigest()[:12],
    "metadata": {},
    "source": source.splitlines(keepends=True),
  }


def code_cell(source: str) -> dict[str, Any]:
  return {
    "cell_type": "code",
    "execution_count": None,
    "id": sha1(f"code:{source}".encode(), usedforsecurity=False).hexdigest()[:12],
    "metadata": {},
    "outputs": [],
    "source": source.splitlines(keepends=True),
  }


def quiz_cell(items: list[tuple[str, str]]) -> dict[str, Any]:
  questions = "\n".join(f"{index}. {question}" for index, (question, _) in enumerate(items, 1))
  answers = "\n".join(f"{index}. {answer}" for index, (_, answer) in enumerate(items, 1))
  return markdown_cell(
    "## 퀴즈\n\n"
    "코드를 다시 보지 않고 먼저 답해본다.\n\n"
    f"{questions}\n\n"
    "<details>\n"
    "<summary>정답과 해설 보기</summary>\n\n"
    f"{answers}\n\n"
    "</details>"
  )


def module_source(path: str, drop_relative_imports: bool = False) -> str:
  source = (BASE / path).read_text()
  source = source.split('\nif __name__ == "__main__":', maxsplit=1)[0]
  source = "\n".join(line for line in source.splitlines() if line != "import uvicorn")
  if drop_relative_imports:
    source = "\n".join(line for line in source.splitlines() if not line.startswith("from ."))
  return source.rstrip()


def lesson(title: str, goals: str, cells: list[dict[str, Any]]) -> dict[str, Any]:
  return {
    "cells": [
      markdown_cell(f"# {title}\n\n{goals}"),
      *cells,
    ],
    "metadata": {
      "kernelspec": {
        "display_name": "Python 3.13 (study-llmserving)",
        "language": "python",
        "name": "python3",
      },
      "language_info": {"name": "python", "version": "3.13"},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
  }


def basic_notebook() -> dict[str, Any]:
  return lesson(
    "02. 단일 요청 처리",
    "- API와 model worker의 역할 구분\n- 별도 process와 queue 기반 IPC 이해",
    [
      markdown_cell("## 구현 코드\n\n셀을 실행해 class와 FastAPI endpoint를 직접 정의한다."),
      code_cell(module_source("02_basic/serving_v1.py")),
      markdown_cell(
        "## Model worker 직접 실행\n\nIPC를 붙이기 전에 model worker의 입력과 출력을 확인한다."
      ),
      code_cell(
        "worker = ModelWorker(MODEL_NAME, DEVICE)\n"
        'requests = [{"request_id": "notebook-1", "prompt": "Hello, I am"}]\n'
        "worker.generate(requests)"
      ),
      quiz_cell(
        [
          (
            "ModelExecutor가 task queue와 result queue를 분리한 이유는 무엇인가?",
            "task queue는 추론 요청을 worker로 전달하고 result queue는 완료 결과를 "
            "API 쪽으로 돌려준다. 양방향 IPC의 역할과 흐름을 분리한다.",
          ),
          (
            "batching 없이 동시 요청 수만 늘리면 model worker throughput이 증가하는가?",
            "증가하지 않는다. 단일 worker가 요청을 하나씩 처리하므로 요청은 task queue에서 "
            "대기하고 model 호출 횟수는 그대로다.",
          ),
        ]
      ),
    ],
  )


def batching_notebook() -> dict[str, Any]:
  return lesson(
    "03. Batching과 Sequence 추적",
    "- request를 sequence로 추적\n- FIFO batch 구성과 throughput/latency trade-off 확인",
    [
      markdown_cell("## 구현 코드\n\n셀을 실행해 sequence와 batching 구현을 직접 정의한다."),
      code_cell(module_source("03_batching/serving_v2.py")),
      markdown_cell("## FIFO batch 직접 구성\n\n5개 요청 중 batch size 4만 활성 batch로 이동한다."),
      code_cell(
        "manager = WorkloadManager(batch_size=4)\n"
        'request_ids = [manager.add_request(f"prompt-{index}") for index in range(5)]\n'
        "first_batch = manager.get_next_batch()\n"
        "[sequence.id for sequence in first_batch], manager.incoming_queue.qsize()"
      ),
      markdown_cell("## model batch 직접 실행\n\n서로 다른 요청을 한 번의 model 호출로 처리한다."),
      code_cell(
        "worker = ModelWorker(MODEL_NAME, DEVICE)\n"
        "payload = [\n"
        '  {"request_id": sequence.id, "prompt": sequence.prompt}\n'
        "  for sequence in first_batch\n"
        "]\n"
        "worker.generate(payload)"
      ),
      quiz_cell(
        [
          (
            "여러 사용자의 prompt를 한 batch에 섞은 뒤 결과를 원래 요청에 "
            "되매핑하려면 어떤 값이 필요한가?",
            "각 sequence를 식별하는 request ID 또는 sequence ID가 필요하다. "
            "worker 결과에도 같은 ID를 포함해야 한다.",
          ),
          (
            "batch size를 키울 때 개별 요청 latency가 증가할 수 있는 원인 두 가지는 무엇인가?",
            "batch가 채워질 때까지의 대기 시간과 길이가 다른 prompt를 맞추기 위한 "
            "padding·동기화 비용이다.",
          ),
        ]
      ),
    ],
  )


def streaming_notebook() -> dict[str, Any]:
  return lesson(
    "04. Streaming with Batching",
    "- 토큰 단위 forward 이해\n- background thread와 asyncio queue 연결 이해",
    [
      markdown_cell("## 구현 코드\n\n셀을 실행해 SSE와 continuous batching 구현을 직접 정의한다."),
      code_cell(module_source("04_streaming/serving_v3.py")),
      markdown_cell(
        "## 토큰 한 개 직접 생성\n\n`model.generate()` 대신 forward 한 번으로 다음 토큰을 만든다."
      ),
      code_cell(
        "worker = ModelWorker(MODEL_NAME, DEVICE)\n"
        "batch = [\n"
        '  {"request_id": "notebook-1", "prompt": "Hello, I am"},\n'
        '  {"request_id": "notebook-2", "prompt": "The weather is"},\n'
        "]\n"
        "worker.generate_forward_batch(batch)"
      ),
      quiz_cell(
        [
          (
            "완료된 sequence를 active batch에서 즉시 제거해야 하는 이유는 무엇인가?",
            "끝난 sequence에 연산을 낭비하지 않고 빈 자리에 대기 중 sequence를 합류시켜 "
            "continuous batching을 유지하기 위해서다.",
          ),
          (
            "`use_cache=False`일 때 생성 길이가 늘수록 token step 비용이 커지는 이유는 무엇인가?",
            "KV cache를 재사용하지 않아 매 step마다 지금까지의 전체 prompt와 "
            "생성 토큰을 다시 계산하기 때문이다.",
          ),
        ]
      ),
    ],
  )


def vllm_notebook() -> dict[str, Any]:
  return lesson(
    "05. vLLM으로 치환",
    "- 직접 만든 scheduler와 worker를 vLLM으로 치환\n- Ubuntu RTX 환경에서 실행",
    [
      markdown_cell(
        "## 환경 제한\n\n"
        "vLLM library mode는 Ubuntu RTX 환경에서 `uv sync --dev --extra gpu` 후 실행한다. "
        "macOS에서는 이 코드 셀을 읽고 server mode client만 실행한다."
      ),
      markdown_cell("## 구현 코드\n\n셀을 실행해 vLLM 기반 engine과 endpoint를 직접 정의한다."),
      code_cell(module_source("05_vllm/serving_v4_vllm.py")),
      markdown_cell("## vLLM engine 직접 실행\n\n여러 prompt가 engine 내부 scheduler로 전달된다."),
      code_cell('engine = LLMEngine()\nengine.generate(["Hello, I am", "The weather is"])'),
      quiz_cell(
        [
          (
            "`max_num_seqs`는 직접 구현의 어떤 제한값과 대응하는가?",
            "동시에 active batch에 포함할 sequence 수를 제한하는 `batch_size`와 대응한다. "
            "실제 vLLM에서는 scheduler가 이 상한 안에서 sequence를 동적으로 구성한다.",
          ),
          (
            "library mode와 standalone server mode의 운영상 차이는 무엇인가?",
            "library mode는 애플리케이션 process 안에서 engine을 직접 호출해 제어하기 쉽다. "
            "server mode는 별도 process와 OpenAI 호환 API로 분리되어 독립 배포·스케일링과 "
            "다언어 client 연결에 유리하다.",
          ),
        ]
      ),
    ],
  )


def multimodel_notebook() -> dict[str, Any]:
  modules = [
    module_source("06_multimodel/app/store.py"),
    module_source("06_multimodel/app/worker.py"),
    module_source("06_multimodel/app/engine.py", drop_relative_imports=True),
    module_source("06_multimodel/app/manager.py", drop_relative_imports=True),
  ]
  return lesson(
    "06. Multi-Model Serving",
    "- metadata 기반 worker factory 이해\n- LRU cache hit, miss, eviction 직접 확인",
    [
      markdown_cell("## 구현 코드\n\n각 셀을 순서대로 실행해 component를 직접 정의한다."),
      *[code_cell(source) for source in modules],
      markdown_cell(
        "## model download 없는 LRU 실험\n\n가짜 engine을 연결해 cache 정책만 분리해서 실행한다."
      ),
      code_cell(
        "class FakeWorker:\n"
        "  def __init__(self, metadata):\n"
        "    self.model_metadata = metadata\n\n"
        "class FakeEngine:\n"
        "  def __init__(self):\n"
        "    self.workers = {}\n\n"
        "  def get_worker(self, model_id):\n"
        "    return self.workers.get(model_id)\n\n"
        "  def create_worker(self, metadata):\n"
        "    worker = FakeWorker(metadata)\n"
        "    self.workers[metadata.id] = worker\n"
        "    return worker\n\n"
        "  def delete_worker(self, model_id):\n"
        "    self.workers.pop(model_id, None)\n\n"
        "from pathlib import Path\n\n"
        'config_path = Path("config/models.json")\n'
        "if not config_path.exists():\n"
        '  config_path = Path("06_multimodel/config/models.json")\n'
        "store = ModelStore(str(config_path))\n"
        "manager = ModelManager(store, max_models=2)\n"
        "manager.model_engine = FakeEngine()\n"
        "model_ids = list(store.models)[:3]\n"
        "for model_id in [*model_ids, *model_ids]:\n"
        "  manager.get_model_worker(model_id)\n"
        "manager.stats()"
      ),
      quiz_cell(
        [
          (
            "cache 크기 2에 model 3개 요청이 round-robin으로 들어오면 왜 thrashing이 발생하는가?",
            "다음 차례에 필요한 model이 항상 직전 eviction 대상이 된다. "
            "거의 모든 요청이 cache miss와 model reload를 일으킨다.",
          ),
          (
            "TritonWorker가 Triton에 위임하는 기능은 무엇인가?",
            "model repository의 load·unload, framework별 추론 실행, "
            "tensor 기반 inference protocol과 accelerator 메모리 관리를 위임한다.",
          ),
        ]
      ),
    ],
  )


def tradeoff_notebook() -> dict[str, Any]:
  return lesson(
    "07. Cost와 Latency 설계 비교",
    "- reactive routing과 static routing 비교\n- cold start와 자원 비용 trade-off 이해",
    [
      markdown_cell("## Cost-optimized router\n\n동적으로 학습한 warm backend map을 사용한다."),
      code_cell(module_source("07_tradeoff/router.py")),
      markdown_cell(
        "## warm backend 선택 직접 실행\n\n"
        "라우팅 map과 round-robin cursor를 직접 바꿔 결과를 확인한다."
      ),
      code_cell(
        "routing_map.clear()\n"
        'routing_map["sentiment"] = ["http://worker-a", "http://worker-b"]\n'
        '[pick_backend("sentiment") for _ in range(4)]'
      ),
      markdown_cell(
        "## Latency-optimized router\n\n사전에 배치한 model-to-backend map을 사용한다."
      ),
      code_cell(
        "import os\n"
        "from pathlib import Path\n\n"
        'routing_path = Path("routing.json")\n'
        "if not routing_path.exists():\n"
        '  routing_path = Path("07_tradeoff/routing.json")\n'
        'os.environ["ROUTING_MAP_PATH"] = str(routing_path)'
      ),
      code_cell(module_source("07_tradeoff/static_router.py")),
      quiz_cell(
        [
          (
            "cost-optimized 설계에서 p50보다 p95와 max latency가 크게 나타나는 원인은 무엇인가?",
            "cache miss 요청에만 model load cold start가 추가되기 때문이다. "
            "대부분의 warm 요청은 빠르지만 일부 miss가 tail latency를 크게 만든다.",
          ),
          (
            "latency-optimized 설계에서 model 수가 늘면 어떤 자원이 선형 증가하는가?",
            "model별 전용 Deployment·Pod와 사전 로드된 CPU·GPU·메모리 용량이 "
            "model 수에 따라 증가한다.",
          ),
        ]
      ),
    ],
  )


NOTEBOOKS = {
  "02_basic/02_basic.ipynb": basic_notebook,
  "03_batching/03_batching.ipynb": batching_notebook,
  "04_streaming/04_streaming.ipynb": streaming_notebook,
  "05_vllm/05_vllm.ipynb": vllm_notebook,
  "06_multimodel/06_multimodel.ipynb": multimodel_notebook,
  "07_tradeoff/07_tradeoff.ipynb": tradeoff_notebook,
}


def main() -> None:
  for relative_path, build in NOTEBOOKS.items():
    path = BASE / relative_path
    path.write_text(json.dumps(build(), ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {relative_path}")


if __name__ == "__main__":
  main()
