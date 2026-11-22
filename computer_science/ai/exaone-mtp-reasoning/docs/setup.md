# 환경 준비

[3번 문서](3-benchmark-design.md)의 테스트를 실행할 환경입니다. vLLM은 NVIDIA GPU가 있는 Linux 서버에, GuideLLM은 서버에 HTTP로 닿는 아무 장비에 설치합니다. 이 핸즈온은 GPU 없이 작성했으므로 vLLM 설치와 기동은 실행하지 않았습니다.

## 필요한 것

| 항목 | 값 |
|---|---|
| GPU | EXAONE-4.5-33B-FP8을 올릴 수 있는 메모리. 블로그 실험은 RTX PRO 6000(96GB) |
| vLLM | EXAONE 4.5 MTP를 지원하는 버전. 블로그 실험은 v0.31.0 |
| GuideLLM | 0.8.1(문서의 명령을 확인한 버전) |
| 기타 | `jq`, `curl` |

## 설치

vLLM 서버에서 설치합니다.

```bash
uv pip install vllm
```

GuideLLM은 버전을 고정해 설치합니다. 문서의 CLI 형식(`kind=...`)은 0.8.1 기준입니다.

```bash
uv tool install guidellm==0.8.1
```

## 데이터 준비

workspace 루트에서 결과 디렉터리를 만들고 공개 Mooncake trace를 받습니다.

```bash
cd computer_science/ai/exaone-mtp-reasoning
mkdir -p results trace
curl -sL https://raw.githubusercontent.com/kvcache-ai/Mooncake/main/FAST25-release/arxiv-trace/mooncake_trace.jsonl -o trace/mooncake_trace.jsonl
```

받은 파일은 23,608줄이고, 첫 줄은 아래 형식입니다. `timestamp`는 밀리초입니다.

```text
{"timestamp": 0, "input_length": 6755, "output_length": 500, "hash_ids": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]}
```

## GPU 없이 GuideLLM 명령만 확인

GuideLLM에는 OpenAI 호환 mock 서버가 들어 있어, GPU 없이도 명령 문법과 replay 타이밍을 확인할 수 있습니다. mock 서버는 프롬프트를 이해하지 않으므로 지연과 수용률 수치는 의미가 없습니다.

```bash
guidellm mock-server --port 8800 --model exaone-mock --ttft-ms 50 --itl-ms 5 --output-tokens 64
```

mock 서버를 대상으로 실행할 때는 3번 문서의 명령에서 `target`을 `http://localhost:8800`, `model`을 `exaone-mock`으로 바꾸고, tokenizer를 따로 지정합니다.

```bash
--tokenizer kind=huggingface_auto,model=gpt2
```

## 정리

GuideLLM은 결과 파일만 남깁니다. vLLM 서버는 `Ctrl+C`로 멈추고, 받은 trace와 결과는 디렉터리째 지웁니다.

```bash
rm -rf results trace
```
