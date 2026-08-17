# Bedrock RAG

로컬 FAISS RAG 실습을 AWS Bedrock Knowledge Bases와 S3 Vectors로 옮기는 예제입니다.

## 핵심 구조

- Source: S3
- RAG 관리: Amazon Bedrock Knowledge Bases
- Vector store: Amazon S3 Vectors
- Embedding: Titan Text Embeddings V2
- Test: Bedrock console, AWS CLI

## 문서

| 문서 | 내용 |
|---|---|
| [concepts.md](./docs/concepts.md) | Bedrock, S3 Vectors, RAG 구조 |
| [hands-on.md](./docs/hands-on.md) | Terraform 배포와 테스트 |
| [references.md](./docs/references.md) | 참고자료 |

## 파일

- [arch.drawio](./arch.drawio)
- [terraform](./terraform/)
- [terraform.tfvars.example](./terraform/terraform.tfvars.example)
- [sample-data](./sample-data/)
