# Bedrock 연동 설정

## TL;DR

- LiteLLM의 Bedrock provider route는 `bedrock/` prefix를 사용합니다.
- ECS에서는 access key를 넣기보다 task role로 Bedrock 호출 권한을 주는 흐름을 우선합니다.
- 모델 ID, 지원 리전, IAM 세부 권한은 계정과 Bedrock model access 설정에 따라 달라서 확인 필요입니다.
- 이 문서는 설정 예시를 제공하고, 실제 호출 검증은 AWS 계정에서 수행해야 합니다.

## 로컬 설정을 Bedrock으로 바꾸기

로컬 mock 대신 Bedrock을 호출하려면 `model_list`를 다음처럼 바꿉니다.

```yaml
model_list:
  - model_name: bedrock-claude
    litellm_params:
      model: bedrock/anthropic.claude-3-sonnet-20240229-v1:0
      aws_region_name: os.environ/AWS_REGION_NAME

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

로컬에서 AWS profile을 사용한다면 컨테이너에 credential을 전달해야 합니다. 이 방식은 실습 편의성은 있지만, 장기적으로는 권한이 넓어지기 쉽습니다.

장점: 로컬에서 빠르게 Bedrock 연결을 확인할 수 있습니다.

단점: AWS credential mount와 profile 이름이 개인 환경에 의존합니다. 이 저장소에는 개인 profile 이름을 넣지 않습니다.

## ECS에서는 task role을 우선 사용

ECS에서는 task role에 Bedrock 호출 권한을 붙입니다. 예제 Terraform은 다음 action을 task role에 부여합니다.

```text
bedrock:InvokeModel
bedrock:InvokeModelWithResponseStream
```

리소스는 예제에서 `*`로 열어 두었습니다. 실제 환경에서는 사용할 foundation model ARN으로 좁히는 편이 좋습니다.

장점: access key를 컨테이너 환경 변수로 넣지 않아도 됩니다.

단점: 모델별 ARN, 리전, cross-region inference profile 사용 여부를 실제 계정에서 확인해야 합니다.

## 요청 예시

Bedrock 설정으로 프록시가 떠 있으면 다음 요청으로 확인합니다.

```shell
curl -sS http://localhost:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer sk-local-change-me' \
  -d '{
    "model": "bedrock-claude",
    "messages": [
      {"role": "user", "content": "LiteLLM proxy가 Bedrock 앞에서 하는 역할을 한 문장으로 설명해줘"}
    ]
  }'
```

## 확인 필요

- 사용할 Bedrock 모델이 선택한 리전에서 활성화되어 있는지 확인 필요.
- 계정에서 해당 model access가 승인되어 있는지 확인 필요.
- `bedrock:InvokeModelWithResponseStream`이 필요한지, non-stream 호출만 쓰는지 확인 필요.
- cross-region inference profile을 쓰는 경우 모델 ID와 IAM resource 범위를 별도로 확인 필요.
