# Chapter 4 학습 가이드

## 실습 문서

| 순서 | 문서 | 노트북 | 주제 |
|---|---|---|---|
| 1 | [LangChain Agent](docs/01-langchain-agent.md) | `notebooks/01_langchain_agent.ipynb` | tool 호출 |
| 2 | [RAG Vector Search](docs/02-rag-vector-search.md) | `notebooks/02_rag_vector_search.ipynb` | embedding, vector search |
| 3 | [Fine-tuning LoRA](docs/03-fine-tuning-lora.md) | `notebooks/03_fine_tuning_lora.ipynb` | Llama 3, quantization, LoRA |

## 공통 실행

1. 파이썬 가상환경 설정

```bash
uv venv -p 3.12
uv sync

```

2. openAI API key 설정

- openAI platform에서 API key 발급
- `.env`에 `OPENAI_API_KEY`를 입력
- LangSmith trace가 필요하면 `.env`에 `LANGSMITH_TRACING=true`와 `LANGSMITH_API_KEY`를 입력

```bash
cp .env.example .env
```

## 예제 실습

```bash
uv run python -m ipykernel install --user --name rag-study --display-name "Python (rag-study)"
```


fine-tuning 실습은 GPU 환경에서 추가 의존성을 설치한다.

```bash
uv sync --extra finetuning
```

## 참고자료

- [OpenAI - Latest model guide](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI - Vector embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [LangChain - OpenAI integrations](https://docs.langchain.com/oss/python/integrations/providers/openai)
- [LangChain - FAISS vector store](https://docs.langchain.com/oss/python/integrations/vectorstores/faiss)
- [LangChain - CSV document loader](https://docs.langchain.com/oss/python/integrations/document_loaders/csv)
