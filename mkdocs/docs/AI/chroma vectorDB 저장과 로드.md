## 개요
chroma vectorDB에 데이터를 저장하는 방법과 로드하는 방법을 설명

## 저장 방법
{==persist_directory인자==}에 저장할 위치를 설정합니다. jupyter를 사용하는 경우 persist 함수를 호출해야 합니다.

```python
from langchain.vectorstores import Chroma

vector_db = Chroma.from_documents(
  documents=chunks,
  embedding=embeddings,
  persist_directory="./vectorstore/example-embedding",
)

# jupyter를 사용하면 persist()함수를 호출해야 함
# reference: https://stackoverflow.com/questions/77231763/cannot-load-persisted-db-using-chroma-langchain
vector_db.persist()
```


## 로드 방법
{==persist_directory인자==}에 데이터가 있는 경로를 설정합니다.

```python
import chromadb
from langchain.vectorstores import Chroma

client_settings = chromadb.config.Settings(
  persist_directory="./vectorstore/example-embedding/",
  chroma_db_impl="parquet"
)
vector_db = Chroma(
  client_settings=client_settings,
  embedding_function=embeddings
)
```

## 참고자료

* https://python.langchain.com/docs/integrations/vectorstores/chroma
* https://stackoverflow.com/questions/76232375/langchain-chroma-load-data-from-vector-database
