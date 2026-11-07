# 실습 환경 구성

## 준비물

- Terraform 1.11 이상
- AWS CLI v2와 Bedrock, CloudWatch, CloudTrail 조회 권한이 있는 로컬 profile
- Docker와 Docker Compose
- jq, curl, uv
- Ollama(비Bedrock 모델 경로를 무료로 확인할 때 사용)

기본 리전은 `ap-northeast-2`입니다. 서울 리전에서는 Nova Micro를 `apac.amazon.nova-micro-v1:0` inference profile로만 호출할 수 있고, guardrail의 Standard tier도 `apac.guardrail.v1:0` guardrail profile을 거칩니다. 그래서 리전을 바꾸면 [variables.tf](../terraform/variables.tf)의 `aws_region`, `guardrail_profile_id`와 [config.yaml](../litellm/config.yaml)의 모델 ID를 함께 바꿔야 합니다.

## LiteLLM 버전

LiteLLM은 `v1.108.2` 이미지로 고정합니다. 2026-10월 공개된 `1.107.0`은 공급망 공격으로 악성 페이로드가 들어가 PyPI에서 내려간 버전이기 때문입니다. pip로 직접 설치할 때도 같은 버전을 씁니다.

아래 명령으로 설치된 버전을 확인하고, site-packages에 시작 훅이 끼어들지 않았는지도 함께 봅니다.

```bash
docker run --rm --entrypoint sh ghcr.io/berriai/litellm:v1.108.2 -c '
python -c "import importlib.metadata as m; print(m.version(\"litellm\"))"
ls "$(python -c "import site; print(site.getsitepackages()[0])")" | grep -E "cook|sitecustomize" || echo "no startup hook"'
```

정상이면 버전과 함께 훅이 없다는 메시지가 출력됩니다.

```text
1.108.2
no startup hook
```

proxy는 외부에 노출하지 않고, `LITELLM_MASTER_KEY`에는 랜덤 값을 넣습니다. 관리 UI(`http://localhost:4000/ui`)는 `admin`과 이 키로 로그인하며, 로그인에 DB가 필요해서 compose가 Postgres를 함께 띄웁니다. Enterprise 라이선스는 쓰지 않습니다.

## 1. guardrail 생성

guardrail은 [terraform/](../terraform/)이 관리합니다. Terraform 코드에는 AWS profile을 적지 않았으므로, 셸에서 사용할 profile을 먼저 지정합니다. LiteLLM 컨테이너와 `scripts/`의 AWS CLI 호출도 같은 `AWS_PROFILE`을 씁니다.

```bash
cd aws/bedrock/guardrails
export AWS_PROFILE=<로컬 profile>
```

[guardrail.tf](../terraform/guardrail.tf)가 guardrail과 버전 1을 만들고, `runtime_env` output을 `.runtime.env`로 저장해 LiteLLM과 스크립트가 읽게 합니다.

```bash
terraform -chdir=terraform init
terraform -chdir=terraform apply
terraform -chdir=terraform output -raw runtime_env > .runtime.env
cat .runtime.env
```

`.runtime.env`에는 다음 값이 들어갑니다.

```text
AWS_REGION=ap-northeast-2
GUARDRAIL_ID=<guardrail ID>
GUARDRAIL_VERSION=1
GUARDRAIL_ARN=arn:aws:bedrock:ap-northeast-2:<계정 ID>:guardrail/<guardrail ID>
```

guardrail ID는 생성할 때마다 달라집니다. 시나리오 문서의 출력에 `guardrailVersion: "2"`가 보이는 것은 같은 정책 정의를 두 번째 버전으로 발행한 guardrail에서 측정했기 때문입니다. guardrail 자체에는 상시 요금이 없고 평가한 text unit만큼만 과금됩니다.

## 2. 로컬 모델 준비

비Bedrock 경로에서 쓸 모델을 Ollama로 받습니다.

```bash
ollama pull qwen2.5:1.5b
```

## 3. LiteLLM 기동

`OPENAI_API_KEY`는 비워 두어도 `gpt` 모델 호출만 실패하고 나머지는 그대로 동작합니다. `.env.example`을 복사해 `LITELLM_MASTER_KEY`를 랜덤 값으로 바꾼 뒤 LiteLLM을 띄웁니다.

```bash
cp .env.example .env
sed -i '' "s/^LITELLM_MASTER_KEY=.*/LITELLM_MASTER_KEY=sk-$(openssl rand -hex 24)/" .env
docker compose up -d --wait
```

LiteLLM 컨테이너는 `~/.aws`를 읽기 전용으로 마운트하고 셸의 `AWS_PROFILE`을 그대로 넘겨받습니다. 콘솔 로그인과 요청 로그용 Postgres도 함께 뜹니다. 이어서 LiteLLM guardrail이 로드됐는지 확인합니다. LiteLLM guardrail 여섯 개가 모두 같은 Bedrock guardrail을 가리키고, 검사 시점, 검사 범위, 스트리밍 방식만 다릅니다. 시나리오마다 요청의 `guardrails` 필드로 골라 쓰므로 LiteLLM을 다시 띄우지 않습니다.

```bash
set -a; source .env; set +a
curl -s localhost:4000/guardrails/list -H "Authorization: Bearer $LITELLM_MASTER_KEY" | jq -r '.guardrails[].guardrail_name'
```

이름 여섯 개가 보이면 정상입니다.

```text
guardrails-handson
guardrails-input
guardrails-input-latest
guardrails-input-incremental
guardrails-output
guardrails-output-release
```

설정이 잘못된 guardrail이 있어도 LiteLLM은 그 guardrail만 건너뛰고 proxy를 정상 기동합니다. 그래서 목록이 비어 있으면 `docker compose logs litellm | grep Skipping`으로 이유를 확인합니다.

## 4. 호출 헬퍼 로드

각 시나리오는 [lib.sh](../scripts/lib.sh)의 함수를 쓰므로, 시작하기 전에 `.runtime.env`와 함께 불러옵니다.

```bash
set -a; source .runtime.env; set +a
source scripts/lib.sh
```

| 함수 | 용도 |
|---|---|
| `aws_apply <text> [INPUT\|OUTPUT]` | LiteLLM 없이 ApplyGuardrail을 직접 호출해 판정만 출력 |
| `chat <model> <guardrail\|none> <message> [stream]` | LiteLLM chat completions 호출 |
| `chat_json <guardrail> <messages-json>` | 멀티턴, system 메시지 실험 |
| `apply_only <guardrail> <text>` | LiteLLM의 `/guardrails/apply_guardrail`로 guardrail만 실행 |

## 정리

실습이 끝나면 LiteLLM 컨테이너와 guardrail을 지웁니다. guardrail을 삭제하면 그 guardrail의 모든 버전이 함께 삭제됩니다.

```bash
docker compose down -v
terraform -chdir=terraform destroy
rm -f .runtime.env
```
