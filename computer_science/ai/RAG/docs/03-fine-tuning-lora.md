# Fine-tuning LoRA

## 주제

Llama 3 모델을 4-bit로 로드하고 LoRA(Low-Rank Adaptation)로 일부 파라미터만 학습한다.

실습 노트북:

```text
notebooks/03_fine_tuning_lora.ipynb
```

작업 기준 디렉터리는 이 문서가 있는 `docs/`의 상위 디렉터리, 즉 `RAG` uv 프로젝트 루트다.

## 이론 설명

Fine-tuning은 모델이 특정 도메인 데이터의 답변 패턴을 학습하도록 추가 훈련하는 방식이다. RAG가 외부 문서를 검색해 context에 넣는 방식이라면, fine-tuning은 모델의 동작 자체를 바꾼다.

전체 파라미터를 학습하면 GPU 메모리와 시간이 많이 든다. LoRA는 기존 모델 가중치를 대부분 고정하고, 일부 low-rank adapter만 학습한다. 학습할 파라미터 수가 줄어들어 비용이 낮아진다.

4-bit quantization은 모델 가중치를 낮은 정밀도로 로드해 메모리 사용량을 줄인다. 이 실습은 `BitsAndBytesConfig`로 4-bit 설정을 만든다.

구성 요소:

- `AutoModelForCausalLM`: causal language model 로드
- `AutoTokenizer`: prompt tokenization
- `BitsAndBytesConfig`: 4-bit quantization 설정
- `prepare_model_for_kbit_training`: k-bit training 준비
- `LoraConfig`: LoRA 대상 모듈과 rank 설정
- `Trainer`: 학습 루프 실행

## 실습방법

fine-tuning은 GPU 환경이 필요하다. 기본 의존성과 추가 의존성을 설치한다.

```bash
uv sync
uv sync --extra finetuning
cp .env.example .env
```

`.env`에서 모델과 데이터 경로를 확인한다.

```text
HF_BASE_MODEL=meta-llama/Meta-Llama-3-8B
FINE_TUNE_TRAIN_FILE=data/loyalty_qa_train.jsonl
FINE_TUNE_EVAL_FILE=data/loyalty_qa_val.jsonl
```

학습 데이터는 JSONL 형식이다. 각 행은 최소한 `prompt`, `response` 필드를 가진다.

예시:

```json
{"prompt":"What is the maximum cashback I can earn?","response":"The maximum cashback is 2%."}
```

VS Code에서 `notebooks/03_fine_tuning_lora.ipynb`를 연다. GPU 커널을 선택한다.

실행 순서:

1. 환경 셀에서 모델명과 데이터 경로를 확인한다.
2. dataset 셀에서 train/eval 데이터를 로드한다.
3. model 셀에서 4-bit quantization 설정으로 모델을 로드한다.
4. tokenize 셀에서 prompt/response를 학습 텍스트로 변환한다.
5. LoRA 셀에서 trainable parameter 비율을 확인한다.
6. train 셀에서 학습을 실행한다.
7. inference 셀에서 학습 후 답변을 확인한다.

## 실습에서 관찰할 것

- GPU 메모리가 모델 로드 단계에서 얼마나 사용되는지 확인한다.
- 4-bit 설정을 사용했을 때 모델이 로드되는지 확인한다.
- `model.print_trainable_parameters()`에서 전체 파라미터 대비 학습 파라미터 비율을 확인한다.
- `target_modules`에 어떤 projection layer가 포함되는지 확인한다.
- 학습 전후 같은 질문에 대한 답변이 어떻게 달라지는지 확인한다.
- `max_steps`, batch size, gradient accumulation이 학습 시간과 메모리에 미치는 영향을 확인한다.
- RAG처럼 외부 문서를 바꾸는 방식이 아니라, 모델 adapter를 저장하고 재사용하는 방식임을 확인한다.

## 마무리 질문

1. Fine-tuning과 RAG의 차이는 무엇인가?
2. LoRA가 전체 fine-tuning보다 비용을 줄이는 이유는 무엇인가?
3. 4-bit quantization은 어떤 문제를 해결하는가?
4. `target_modules`를 잘못 고르면 어떤 문제가 생길 수 있는가?
5. 도메인 지식이 자주 바뀌는 경우 fine-tuning보다 RAG가 유리한 이유는 무엇인가?
