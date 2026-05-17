# Fine-tuning LoRA

## 주제

맥북에서 LM Studio에서 다운로드한 Qwen2.5 0.5B MLX 모델을 LoRA로 학습하고, fine-tuning 전후 답변을 비교한다.

실습 노트북:

```text
notebooks/03_fine_tuning_lora.ipynb
```

작업 기준 디렉터리는 이 문서가 있는 `docs/`의 상위 디렉터리, 즉 `RAG` uv 프로젝트 루트다.

## 이론 설명

- Fine-tuning은 모델이 특정 도메인 데이터의 답변 패턴을 학습하도록 추가 훈련하는 방식이다. RAG가 외부 문서를 검색해 context에 넣는 방식이라면, fine-tuning은 모델의 답변 습관을 adapter에 저장한다.
- 전체 파라미터를 학습하면 GPU 메모리와 시간이 많이 든다. LoRA는 기존 모델 가중치를 대부분 고정하고, 일부 low-rank adapter만 학습한다. 학습할 파라미터 수가 줄어들어 비용이 낮아진다.
- Mac M 시리즈에서는 CUDA 기반 `bitsandbytes`보다 MLX-LM을 사용하는 편이 단순하다. LM Studio에서 받은 `Qwen2.5-0.5B-Instruct-MLX-4bit` 모델 경로를 `.env`에 넣고, `mlx_lm.lora`로 adapter를 학습한다.

구성 요소:

- `HF_BASE_MODEL`: LM Studio 모델 절대경로
- `train.jsonl`, `valid.jsonl`, `test.jsonl`: MLX-LM 학습 데이터
- `mlx_lm.generate`: fine-tuning 전후 답변 생성
- `mlx_lm.lora`: LoRA adapter 학습

## 실습방법

기본 의존성과 MLX-LM 의존성을 설치한다.

```bash
uv sync
uv sync --extra mlx
cp .env.example .env
```

`.env`에서 모델과 데이터 경로를 확인한다.

```text
HF_BASE_MODEL=/absolute/path/to/your/lmstudio/models/lmstudio-community/Qwen2.5-0.5B-Instruct-MLX-4bit
FINE_TUNE_DATA_DIR=data/loyalty_qa_mlx
FINE_TUNE_ADAPTER_DIR=outputs/qwen25-05b-myelite-adapter
FINE_TUNE_REPORT_TO=none
```

W&B를 사용할 경우 `FINE_TUNE_REPORT_TO=wandb`, `WANDB_API_KEY`, `WANDB_PROJECT`를 설정한다. `WANDB_API_KEY`만 입력하거나 `wandb login`만 실행하면 metric이 기록되지 않는다. Train 셀 출력 명령에 `--report-to wandb --project-name ...`가 포함되는지 확인한다.

학습 데이터는 JSONL 형식이다. `--mask-prompt`와 함께 사용할 때는 MLX-LM chat 데이터 형식인 `messages` 필드를 사용한다.

예시:

```json
{"messages":[{"role":"user","content":"[MyElite Loyalty Program FAQ]: What is the maximum cashback I can earn?"},{"role":"assistant","content":"MyElite members can earn up to 2% cashback on eligible purchases."}]}
```

`FINE_TUNE_DATA_DIR`은 파일 하나가 아니라 데이터셋 디렉터리다. 디렉터리 안에는 아래 세 파일이 있어야 한다.

```text
data/loyalty_qa_mlx/
  train.jsonl
  valid.jsonl
  test.jsonl
```

역할:

- `train.jsonl`: 모델이 학습할 Q/A
- `valid.jsonl`: 학습 중 손실 변화를 확인할 Q/A
- `test.jsonl`: 학습 후 전후 비교에 사용할 Q/A

처음 실습할 때는 노트북의 Dataset 셀이 MyElite 예제 데이터를 자동 생성한다. 이미 세 파일이 있으면 노트북은 기존 파일을 사용한다.

ChatGPT로 만들 때는 먼저 정책 원문을 준비한다. 정책에 없는 내용을 만들지 않도록 지시한다.

```text
아래 정책 원문만 사용해서 MLX-LM fine-tuning용 JSONL 데이터를 만들어줘.

조건:
- 각 줄은 {"messages":[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]} 형식
- user content는 "[MyElite Loyalty Program FAQ]: "로 시작
- assistant content는 정책 원문에 있는 사실만 사용
- 모르는 내용은 추측하지 말 것
- train 30개, valid 5개, test 5개로 분리
- JSONL 코드블록 3개로 출력: train.jsonl, valid.jsonl, test.jsonl

정책 원문:
...
```

Codex CLI를 사용할 때는 정책 원문 파일을 먼저 만든다.

```bash
mkdir -p data/loyalty_qa_mlx
```

정책 원문은 예를 들어 `data/myelite_policy.md`에 둔다. 그 다음 Codex CLI에 아래처럼 요청한다.

```bash
codex "data/myelite_policy.md만 근거로 MLX-LM chat 데이터셋을 만들어줘. 출력 위치는 data/loyalty_qa_mlx/train.jsonl, data/loyalty_qa_mlx/valid.jsonl, data/loyalty_qa_mlx/test.jsonl이다. 각 줄은 messages 필드만 가진 JSONL이어야 한다. messages는 user와 assistant 순서이고, user content는 [MyElite Loyalty Program FAQ]: 로 시작한다. 정책에 없는 내용은 만들지 마라."
```

생성 후에는 JSONL이 깨지지 않았는지 한 줄씩 검사한다.

```bash
uv run python - <<'PY'
import json
from pathlib import Path

for path in Path("data/loyalty_qa_mlx").glob("*.jsonl"):
  for line_number, line in enumerate(path.read_text().splitlines(), start=1):
    item = json.loads(line)
    assert set(item) == {"messages"}, (path, line_number, item)
    assert item["messages"][0]["role"] == "user", (path, line_number, item)
    assert item["messages"][1]["role"] == "assistant", (path, line_number, item)
  print(path, "ok")
PY
```

VS Code에서 `notebooks/03_fine_tuning_lora.ipynb`를 연다.

실행 순서:

1. 환경 셀에서 모델명과 데이터 경로를 확인한다.
2. Dataset 셀에서 기존 데이터셋을 확인한다. 파일이 없으면 MyElite FAQ 예제 데이터를 생성한다.
3. fine-tuning 전 셀에서 기본 모델 답변을 저장한다.
4. train 셀에서 LoRA adapter를 학습한다.
5. fine-tuning 후 셀에서 adapter 적용 답변을 저장한다.
6. 비교 셀에서 전후 답변을 비교한다.

## 실습에서 관찰할 것

- fine-tuning 전 모델이 MyElite 비용을 추측하는지 확인한다.
- fine-tuning 후 답변에 `99 USD`, `non-refundable` 같은 도메인 규칙이 반영되는지 확인한다.
- `outputs/qwen25-05b-myelite-adapter`에 adapter가 저장되는지 확인한다.
- `FINE_TUNE_MAX_ITERS`, `FINE_TUNE_NUM_LAYERS`를 바꿨을 때 학습 시간과 답변 품질이 어떻게 달라지는지 확인한다.
- RAG처럼 외부 문서를 검색하는 방식이 아니라, adapter를 적용해 답변 경향을 바꾸는 방식임을 확인한다.

## 마무리 질문

1. Fine-tuning과 RAG의 차이는 무엇인가?
2. LoRA가 전체 fine-tuning보다 비용을 줄이는 이유는 무엇인가?
3. 4-bit quantization은 어떤 문제를 해결하는가?
4. `target_modules`를 잘못 고르면 어떤 문제가 생길 수 있는가?
5. 도메인 지식이 자주 바뀌는 경우 fine-tuning보다 RAG가 유리한 이유는 무엇인가?
