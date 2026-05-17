# LangChain Agent

## 주제

LLM이 직접 계산하지 않고 tool을 호출해 결과를 만든다.

실습 노트북:

```text
notebooks/01_langchain_agent.ipynb
```

작업 기준 디렉터리는 이 문서가 있는 `docs/`의 상위 디렉터리, 즉 `RAG` uv 프로젝트 루트다.

## 이론 설명

LangChain agent는 LLM 호출에 tool 실행 단계를 붙인 구조다. 일반 LLM 호출은 prompt를 입력하고 답변을 받는다. Agent는 답변 중간에 필요한 tool을 선택하고, tool 실행 결과를 다시 문맥으로 받아 최종 답변을 만든다.

이 예제의 tool은 `count_items`다. 입력으로 문자열 목록을 받고, `Counter`로 중복 개수를 계산한다. LLM이 직접 산술을 추측하지 않고 Python 함수의 결과를 사용하도록 만든다.

핵심 흐름:

1. 사용자 질문을 agent에 전달한다.
2. LLM이 사용할 tool을 고른다.
3. tool이 실제 계산을 수행한다.
4. tool 결과를 바탕으로 최종 답변을 만든다.

Python REPL이나 임의 코드 실행 tool은 강력하지만 위험하다. 외부 입력을 그대로 실행하면 파일 접근, 네트워크 호출, 비밀값 노출 같은 문제가 생길 수 있다. 운영 환경에서는 tool 입력 스키마, 권한, 실행 범위를 제한해야 한다.

LangChain v1에서는 agent graph를 만들 때 `debug=True`를 넘겨 실행 흐름을 출력한다. PDF의 `langchain.debug=True`는 예전 방식이다.

```python
agent = create_agent(
  model=llm,
  tools=[count_items],
  system_prompt="Use tools for deterministic calculations.",
  debug=True,
)
```

LangSmith tracing은 `.env`에 `LANGSMITH_TRACING=true`를 설정했을 때만 켠다. 이때 `LANGSMITH_API_KEY`와 `LANGSMITH_PROJECT`를 입력한다.

## 실습방법

기본 환경을 준비한다.

```bash
uv sync
cp .env.example .env
```

`.env`에 `OPENAI_API_KEY`를 입력한다.

LangSmith로 trace를 보려면 `.env`에 `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`를 입력한다.

VS Code에서 커널을 등록한다.

```bash
uv run python -m ipykernel install --user --name rag-study --display-name "Python (rag-study)"
```

VS Code에서 `notebooks/01_langchain_agent.ipynb`를 연다. 커널은 `Python (rag-study)`를 선택한다.

실행 순서:

1. 환경 셀을 실행한다.
2. `count_items` tool 셀을 실행한다.
3. `create_agent` 셀을 실행한다. 이 셀에 `debug=True`가 설정되어 있다.
4. fruit list 질문 셀을 실행한다.
5. Python `Counter` 결과와 agent 결과를 비교한다.

## 마무리 질문

1. 일반 LLM 호출과 agent 호출의 차이는 무엇인가?
2. Agent가 tool을 사용했다는 사실을 어떤 결과로 확인할 수 있는가?
3. 계산 문제를 LLM 답변만으로 처리하면 어떤 문제가 생길 수 있는가?
4. Python REPL tool을 운영 환경에 그대로 노출하면 어떤 위험이 있는가?
5. Tool 입력 스키마를 제한해야 하는 이유는 무엇인가?
