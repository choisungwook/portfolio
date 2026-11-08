# 트러블슈팅

## Nova Micro 호출이 서울 리전에서 실패함

`amazon.nova-micro-v1:0`로 호출하면 `ValidationException: Invocation of model ID amazon.nova-micro-v1:0 with on-demand throughput isn’t supported.`가 납니다. 서울 리전에서 Nova Micro는 `INFERENCE_PROFILE` 방식만 지원하기 때문입니다.

모델 ID를 `bedrock/apac.amazon.nova-micro-v1:0`로 바꾸면 해결됩니다. 리전별 지원 방식은 다음 명령으로 확인합니다.

```bash
aws bedrock list-foundation-models --region ap-northeast-2 \
  --query "modelSummaries[?contains(modelId,'nova-micro')].[modelId,inferenceTypesSupported]" --output text
```

## LiteLLM이 checks 옵션 guardrail을 건너뜀

InvokeGuardrailChecks를 쓰는 `checks` 옵션으로 guardrail을 등록하면 기동 로그에 `Skipping guardrail '<이름>': invalid configuration`과 함께 `promptAttack.categories Field required`, `sensitiveInformation.entities Field required`가 나옵니다. 1.108.2의 `checks` 스키마는 `promptAttack.categories`와 `sensitiveInformation.entities`를 요구하고, `promptAttack: {}`나 `piiEntities`는 받지 않습니다.

`checks` 아래에 `promptAttack.categories`, `sensitiveInformation.entities` 목록을 적으면 됩니다. 잘못된 guardrail이 있어도 proxy는 정상 기동하므로, `/guardrails/list`로 로드됐는지 따로 확인합니다.

## checks 옵션 guardrail이 403을 돌려줌

`Your account is not authorized to invoke this API operation.`가 납니다. InvokeGuardrailChecks가 `ap-northeast-2`에서 AccessDenied로 거절되기 때문이며, 같은 계정과 같은 권한으로도 `us-east-1`과 `us-west-2`에서는 동작했습니다.

그 guardrail만 `aws_region_name: us-east-1`로 둡니다. 현재 config에는 이 guardrail을 넣지 않았습니다([시나리오 3](./3-litellm-guardrail-modes.md#이-실습에서-켜지-않은-옵션)).

## PII ANONYMIZE가 입력에서 동작하지 않음

`OUTPUT`으로 보내면 `{EMAIL}`로 가려지는 문장이 `INPUT`으로 보내면 `action: NONE`입니다. PII 항목을 만들 때 `action: ANONYMIZE`만 적었기 때문입니다.

`inputAction`과 `outputAction`을 명시하고 새 버전을 발행합니다. [시나리오 2](./2-policy-filters.md)의 API 3단계에서 이 현상을 재현합니다.

## 없는 guardrail ID에 "input is in incorrect format" 오류가 남

`ValidationException: Guardrail was enabled but input is in incorrect format.`가 납니다. 메시지와 달리 입력 형식 문제가 아니라, AWS가 존재하지 않는 guardrail ID에 이 메시지를 돌려주는 것입니다.

입력 형식보다 `GUARDRAIL_ID`, `GUARDRAIL_VERSION`, 리전을 먼저 확인합니다.

## uv run이 interpreter를 찾지 못함

`error: No interpreter found at path <pyenv 가상환경 이름>`이 납니다. uv는 작업 디렉터리에서 위로 올라가며 가장 가까운 `.python-version`을 읽는데, 홈 디렉터리의 `.python-version`이 pyenv 가상환경 이름을 가리키고 있었기 때문입니다. uv는 pyenv 가상환경 이름을 해석하지 못합니다.

workspace 루트에 `.python-version`(값 `3.13`)을 두어 홈의 파일보다 먼저 읽히게 했습니다. workspace 루트에서 실행하면 따로 지정할 것이 없습니다. 다른 디렉터리에서 실행해야 하면 `UV_PYTHON=3.13`을 붙입니다.

## Terraform plan이 Invalid ARN Value로 실패함

`cross_region_config.guardrail_profile_identifier`에 `apac.guardrail.v1:0` 같은 profile ID를 넣으면 plan 단계에서 `The provided value cannot be parsed as an ARN.` 오류가 납니다. AWS CLI와 API는 ID를 받지만 Terraform AWS provider 6.72는 ARN만 받기 때문입니다.

[data.tf](../terraform/data.tf)처럼 `arn:aws:bedrock:<리전>:<계정 ID>:guardrail-profile/<profile ID>` 형식으로 조립해 넘깁니다.
