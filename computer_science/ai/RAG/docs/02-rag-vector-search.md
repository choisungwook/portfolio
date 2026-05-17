# RAG Vector Search

## 주제

외부 문서를 embedding하고, 질문과 가까운 문서를 검색해 LLM context로 전달한다.

실습 노트북:

```text
notebooks/02_rag_vector_search.ipynb
```

작업 기준 디렉터리는 이 문서가 있는 `docs/`의 상위 디렉터리, 즉 `RAG` uv 프로젝트 루트다.

## 이론 설명

RAG(Retrieval-Augmented Generation)는 검색과 생성을 분리한다. Vector store는 질문과 관련된 문서를 찾는다. LLM은 검색된 문서를 context로 받아 답변을 만든다.

Embedding은 텍스트를 숫자 벡터로 바꾸는 과정이다. 문서와 질문을 같은 embedding model로 변환해야 같은 벡터 공간에서 거리를 비교할 수 있다. 이 실습은 `text-embedding-3-small`을 사용한다.

Vector search는 질문 벡터와 가까운 문서 벡터를 찾는다. 작은 데이터는 전체 비교로도 충분하다. 데이터가 커지면 FAISS 같은 index가 검색 범위를 줄여준다.

Top-K는 알고리즘 이름이 아니다. 유사도나 거리 기준으로 정렬했을 때 상위 K개 결과를 가져오는 선택 방식이다. 실제 검색 알고리즘은 vector DB나 index 설정에 따라 달라진다.

흐름:

1. CSV를 `Document` 목록으로 읽는다.
2. 각 문서를 embedding한다.
3. FAISS index에 문서 벡터를 저장한다.
4. 질문을 같은 embedding model로 벡터화한다.
5. 가까운 문서 Top-K를 검색한다.
6. 검색된 문서를 prompt context에 넣는다.
7. LLM이 context 기반 답변을 생성한다.

## 실습방법

기본 환경을 준비한다.

```bash
uv sync
cp .env.example .env
```

`.env`에 `OPENAI_API_KEY`를 입력한다.

LangSmith로 trace를 보려면 `.env`에 `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`를 입력한다. 노트북 커널을 재시작하고 환경변수 셀부터 다시 실행한다.

VS Code에서 `notebooks/02_rag_vector_search.ipynb`를 연다. 커널은 `Python (rag-study)`를 선택한다.

실행 순서:

1. 경로와 환경변수 셀을 실행한다.
2. `data/sample_catalog.csv`를 읽는다.
3. `CSVLoader`로 CSV 행을 `Document`로 변환한다.
4. `OpenAIEmbeddings`로 sample vector 차원을 확인한다.
5. FAISS index를 만든다.
6. 상품 추천 질문으로 similarity search를 실행한다.
7. cosine similarity 계산 결과와 FAISS 검색 결과를 비교한다.
8. 검색된 문서를 context로 묶어 LLM 답변을 생성한다.
9. 개인화 조건을 추가해 답변 변화를 확인한다.

Kaggle 원본 데이터를 사용할 경우 `data/myntra_products_catalog.csv`로 저장한다. 원본 데이터는 Git에 올리지 않는다.

## 실습에서 관찰할 것

- `CSVLoader`가 CSV 한 행을 어떤 `page_content`로 바꾸는지 확인한다.
- LangSmith trace에서 embedding 호출과 LLM 호출을 확인한다. 로컬 FAISS 검색은 별도 run으로 보이지 않을 수 있다.
- `text-embedding-3-small`의 vector dimension을 확인한다.
- FAISS index의 문서 개수와 CSV 행 수가 일치하는지 확인한다.
- Top-K 결과가 질문 조건과 얼마나 맞는지 확인한다.
- score가 낮거나 높은 값으로 나올 때 어떤 기준인지 확인한다.
- cosine similarity 직접 계산 결과와 FAISS 검색 결과가 같은 방향인지 확인한다.
- LLM 답변이 검색된 문서 밖의 정보를 섞는지 확인한다.
- Top-K 값을 줄이거나 늘렸을 때 context 품질이 어떻게 변하는지 확인한다.

## 마무리 질문

1. 문서와 질문을 같은 embedding model로 변환해야 하는 이유는 무엇인가?
2. Vector store와 LLM의 역할은 어떻게 다른가?
3. Top-K 값을 크게 하면 어떤 장점과 단점이 생기는가?
4. 검색 결과가 틀리면 LLM 답변은 어떻게 영향을 받는가?
5. RAG가 hallucination을 줄여도 완전히 없애지 못하는 이유는 무엇인가?
