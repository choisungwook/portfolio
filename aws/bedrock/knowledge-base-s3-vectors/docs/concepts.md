# Bedrock RAG와 S3 Vectors

## 공부 배경

로컬 RAG 실습에서는 CSV를 `Document`로 읽고, embedding을 만든 뒤 FAISS index에 저장했다. 질문이 들어오면 같은 embedding model로 질문을 vector로 바꾸고, 가까운 문서 Top-K를 찾아 prompt context에 넣었다.

AWS에서는 이 흐름을 Bedrock Knowledge Bases가 맡는다. 원본 문서는 일반 S3 bucket에 둔다. Knowledge Base는 문서를 읽고 chunk로 나눈 뒤 Titan Text Embeddings V2로 vector를 만든다. 만들어진 vector와 metadata는 S3 Vectors의 vector index에 저장된다.

## S3 Vectors란 무엇인가

S3 Vectors는 S3 안에 vector 전용 저장 단위를 제공하는 기능이다. 일반 S3 object bucket과 다르게 `vector bucket`과 `vector index`를 만든다. `vector bucket`은 index들을 담는 컨테이너이고, `vector index`는 같은 dimension과 distance metric을 가진 vector 집합이다.

index를 만들 때는 세 가지가 중요하다.

- `dimension`: embedding model이 만드는 vector 길이
- `data_type`: vector 숫자 타입
- `distance_metric`: 유사도 계산 방식

이 예제는 Titan Text Embeddings V2 기본 dimension인 `1024`, `float32`, `cosine`을 사용한다. 로컬 FAISS에서 index를 직접 만든 것처럼, AWS에서는 S3 Vectors index가 검색 대상이 된다.

## 왜 OpenSearch 대신 S3 Vectors인가

OpenSearch Serverless는 검색 엔진이다. keyword search, hybrid search, 검색 튜닝, 높은 query 처리량이 필요하면 좋은 선택이다. 하지만 이 실습은 S3 문서를 Bedrock Knowledge Bases로 연결해 RAG 흐름을 이해하는 것이 목표다.

S3 Vectors는 별도 검색 클러스터를 운영하지 않고 vector를 저장하고 검색할 수 있다. 원본 문서가 S3에 있고, Bedrock Knowledge Bases가 ingestion과 retrieval을 관리한다면 구조가 더 단순하다. 작은 핸즈온에서는 `S3 + Bedrock + S3 Vectors` 조합이 로컬 FAISS 실습의 AWS 버전으로 더 잘 맞는다.

## 아키텍처 흐름

1. Terraform이 일반 S3 bucket에 sample product 문서를 업로드한다.
2. Terraform이 S3 Vectors vector bucket과 vector index를 만든다.
3. Bedrock Knowledge Base가 S3 data source를 읽는다.
4. Knowledge Base가 chunking과 embedding을 수행한다.
5. embedding 결과가 S3 Vectors index에 저장된다.
6. 사용자가 질문하면 Knowledge Base가 관련 chunk를 찾는다.
7. `RetrieveAndGenerate`가 검색된 chunk를 model context로 넣고 답변한다.

## 로컬 실습과의 대응

| 로컬 FAISS 실습 | AWS Bedrock 실습 |
|---|---|
| `sample_catalog.csv` | S3 source document |
| `CSVLoader` | Bedrock S3 data source |
| `OpenAIEmbeddings` | Titan Text Embeddings V2 |
| FAISS index | S3 Vectors index |
| `similarity_search` | Knowledge Base retrieval |
| prompt + LLM | `RetrieveAndGenerate` |

## 주의할 점

S3 Vectors는 vector 검색 저장소이지, 일반 S3 object 검색 기능이 아니다. 원본 문서는 여전히 일반 S3 bucket에 둔다. vector bucket에는 Bedrock이 만든 embedding 결과가 저장된다.

또한 embedding model과 index dimension은 맞아야 한다. Titan Text Embeddings V2를 `1024` dimension으로 설정했으면 S3 Vectors index도 `1024` dimension이어야 한다. 값이 다르면 ingestion이나 query가 실패한다.

Bedrock Knowledge Bases는 S3 Vectors에 chunk text와 Bedrock metadata를 함께 저장한다. S3 Vectors는 기본적으로 metadata를 filterable로 취급하지만, filterable metadata에는 크기 제한이 있다. 그래서 `AMAZON_BEDROCK_TEXT`, `AMAZON_BEDROCK_METADATA`는 vector index 생성 시 non-filterable metadata key로 지정해야 한다.

이 설정은 index 생성 후 변경할 수 없다. 잘못 만든 index에서 sync가 실패했다면 vector index와 Knowledge Base를 다시 만들어야 한다.

<!-- akbun-writing: 로컬 FAISS에서 AWS 관리형 RAG로 넘어가며 헷갈렸던 지점 추가 -->
