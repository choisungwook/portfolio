# Bedrock Knowledge Bases와 S3 Vectors 실습

## 목적

- 로컬 FAISS RAG 실습을 AWS 관리형 구성으로 옮긴다.
  - 로컬 실습 경로: ![바로가기](../../../computer_science/ai/RAG/notebooks/02_rag_vector_search.ipynb)
- Bedrock Knowledge Bases가 S3 문서를 어떻게 chunking, embedding, retrieval하는지 확인한다.
- S3 Vectors가 vector store로 동작하는지 Bedrock console과 AWS CLI로 테스트한다.

## 환경

| 항목 | 값 |
|---|---|
| Cloud | AWS `ap-northeast-2` |
| Terraform | `>= 1.11` |
| Vector store | Amazon S3 Vectors |
| Embedding | Titan Text Embeddings V2 |
| Generation | Claude 3 Haiku 기본값 |

## 사전 준비

AWS CLI 로그인이 필요하다. Bedrock model access에서 Titan Text Embeddings V2와 테스트할 chat model을 사용할 수 있어야 한다.

Terraform 디렉터리로 이동한다.

```bash
cd aws/bedrock/terraform
```

예제 변수 파일을 복사한다.

```bash
cp terraform.tfvars.example terraform.tfvars
```

필요하면 `terraform.tfvars`에서 `bucket_prefix`, model, chunking 값을 수정한다. bucket 이름을 직접 고정하지 않으면 `bedrock-`으로 시작하는 이름에 random suffix가 붙는다.

Terraform provider를 초기화한다.

```bash
terraform init
```

포맷과 정적 검증을 실행한다.

```bash
terraform fmt -recursive
terraform validate
```

생성될 리소스를 확인한다.

```bash
terraform plan
```

## 배포

리소스 생성은 직접 실행한다.

```bash
terraform apply
```

생성되는 주요 리소스:

- 일반 S3 bucket: 원본 문서 저장
- S3 Vectors vector bucket: vector index 컨테이너
- S3 Vectors index: Bedrock embedding 저장
- IAM role: Bedrock Knowledge Base가 S3와 S3 Vectors에 접근
- Bedrock Knowledge Base와 S3 data source

## 문서 동기화

Terraform은 sample 문서를 S3에 올리지만, Knowledge Base ingestion은 별도로 실행해야 한다.

ingestion 명령을 출력한다.

```bash
terraform output -raw start_ingestion_command
```

출력된 ingestion 명령을 실행한다.

```bash
$(terraform output -raw start_ingestion_command)
```

Bedrock console에서 `Knowledge Bases`로 이동한다. 생성된 Knowledge Base를 열고 data source sync 상태가 `Complete`가 될 때까지 기다린다.

## S3 Vectors 데이터 조회

Sync가 `Complete`가 되면 Bedrock Knowledge Bases가 S3 문서를 chunk로 나누고 embedding을 만든 뒤 S3 Vectors index에 저장한 상태다. 일반 S3 object처럼 `aws s3 ls`로 보지 않고 `aws s3vectors` 명령으로 확인한다.

먼저 vector key와 Bedrock metadata를 조회한다.

```bash
aws s3vectors list-vectors \
  --index-arn "$(terraform output -raw vector_index_arn)" \
  --return-metadata \
  --max-items 5 \
  --region ap-northeast-2 \
  --query 'vectors[].{key:key,text:metadata.AMAZON_BEDROCK_TEXT,metadata:metadata.AMAZON_BEDROCK_METADATA}'
```

embedding 값까지 확인하려면 `--return-data`를 사용한다. Titan Text Embeddings V2 기본 dimension은 `1024`라서 전체 vector를 모두 출력하면 길다.

```bash
aws s3vectors list-vectors \
  --index-arn "$(terraform output -raw vector_index_arn)" \
  --return-data \
  --max-items 1 \
  --region ap-northeast-2 \
  --query 'vectors[0].{key:key,vector_preview:data.float32[:10],dimension:length(data.float32)}'
```

특정 vector를 다시 조회하려면 key를 하나 가져와 `get-vectors`에 전달한다.

```bash
VECTOR_KEY=$(aws s3vectors list-vectors \
  --index-arn "$(terraform output -raw vector_index_arn)" \
  --max-items 1 \
  --region ap-northeast-2 \
  --query 'vectors[0].key' \
  --output text)

aws s3vectors get-vectors \
  --index-arn "$(terraform output -raw vector_index_arn)" \
  --keys "$VECTOR_KEY" \
  --return-metadata \
  --return-data \
  --region ap-northeast-2 \
  --query 'vectors[0].{key:key,text:metadata.AMAZON_BEDROCK_TEXT,vector_preview:data.float32[:10]}'
```

metadata나 vector data까지 조회하려면 실행 주체에 `s3vectors:ListVectors`와 `s3vectors:GetVectors` 권한이 필요하다.

결과가 비어 있으면 sync가 아직 끝나지 않았거나 ingestion job이 실패한 상태다. Bedrock console의 data source sync 상태를 먼저 확인한다.

## Sync 실패: filterable metadata 크기 제한

아래 에러가 나오면 S3 Vectors index의 non-filterable metadata key 설정을 확인한다.

```text
Filterable metadata must have at most 2048 bytes
```

Bedrock Knowledge Bases는 chunk text와 Bedrock metadata를 S3 Vectors metadata에 저장한다. 이 값은 검색 filter로 쓸 데이터가 아니므로 index 생성 시 non-filterable로 지정해야 한다.

```hcl
metadata_configuration {
  non_filterable_metadata_keys = [
    "AMAZON_BEDROCK_TEXT",
    "AMAZON_BEDROCK_METADATA",
  ]
}
```

S3 Vectors index의 non-filterable metadata key는 생성 후 변경할 수 없다. 이미 잘못 만든 index라면 `terraform destroy` 후 다시 `terraform apply`를 실행한다.

## Console 테스트

먼저 Bedrock Playground에서 model 호출이 되는지 확인한다.

- Bedrock > Playground > Chat/text
- 사용 가능한 chat model 선택
- 간단한 한국어 질문 입력

그다음 Knowledge Base 테스트 화면으로 이동한다.

- Bedrock > Knowledge Bases
- 생성된 Knowledge Base 선택
- `Test knowledge base` 선택
- model 선택
- 질문 입력

테스트 질문은 아래와 같이 입력한다.

```text
regular fit blue or white formal shirt for men
```

기대 결과:

- `1001`, `1002`, `1006`, `1008` 같은 regular fit 상품이 근거로 나온다.
- slim fit인 `1003`은 우선순위가 낮아야 한다.
- 답변에는 검색된 chunk 기반 citation이 붙어야 한다.

## CLI 테스트

Terraform output을 이용해 Knowledge Base에 직접 질문한다.

```bash
python3 ../scripts/query_knowledge_base.py \
  --knowledge-base-id "$(terraform output -raw knowledge_base_id)" \
  --model-arn "$(terraform output -raw generation_model_arn)" \
  --question "남성용 regular fit 파란색 또는 흰색 formal shirt를 추천해줘"
```

관찰할 것:

- 답변이 sample catalog 밖의 정보를 섞는지 확인한다.
- 질문을 `slim fit`으로 바꾸면 `1003`이 나오는지 확인한다.
- 색상을 `black`으로 바꾸면 `1007`이 검색되는지 확인한다.

## 정리

실습 후 비용 방지를 위해 리소스를 삭제한다.

```bash
terraform destroy
```

삭제 전 ingestion job이 실행 중이면 완료될 때까지 기다린다. Terraform 밖에서 S3 object를 추가했다면 bucket이 비지 않아 삭제가 실패할 수 있다.

<!-- akbun-writing: Bedrock console에서 실제로 헷갈렸던 메뉴와 결과 확인 경험 추가 -->
