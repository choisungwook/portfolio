# 실습 환경 구성

## 준비물

- Terraform 1.11 이상, AWS provider 6.73 이상(`terraform.tf`가 `~> 6.73`으로 고정. `platform_version` 인자는 6.68에 추가됨)
- AWS CLI v2. 2.36.29는 응답에서 `platformVersion`을 버리고, 2.40.2에서는 보입니다([troubleshooting.md](./troubleshooting.md))
- Docker(buildx로 `linux/arm64` 이미지를 빌드)
- jq(시나리오 3, 4에서 응답 필드 추출)
- uv(측정 스크립트 `scripts/runtime.py`가 PEP 723 머리로 boto3를 고정)
- ECR, IAM, Bedrock AgentCore, CloudWatch Logs 권한이 있는 로컬 AWS profile

리전은 `ap-northeast-2`(서울)입니다. 서울은 Runtime V2가 지원되는 19개 리전에 들어 있습니다.

## 만드는 리소스

| 리소스 | 이름 | 역할 |
|---|---|---|
| ECR repository | `agentcore-runtime-v2` | agent 컨테이너 이미지. `force_delete`로 이미지가 있어도 destroy 됨 |
| IAM role | `agentcore-runtime-v2-runtime` | runtime이 ECR에서 이미지를 받고 CloudWatch Logs에 쓰는 실행 역할 |
| AgentCore Runtime | `rtv2_legacy` | `platform_version = var.legacy_platform_version`(기본 `V1`). 시나리오 4에서 V2로 바꿈 |
| AgentCore Runtime | `rtv2_v2` | `platform_version = "V2"` |
| AgentCore Runtime | `rtv2_default` | `platform_version`을 생략. 서비스 기본값이 무엇인지 확인하는 용도 |
| CloudWatch log group | `/aws/vendedlogs/bedrock-agentcore/agentcore-runtime-v2/usage` | runtime 3개의 USAGE_LOGS(session별 1초 단위 vCPU, 메모리 사용량). 보존 1일 |
| log delivery source, destination, delivery | `agentcore-runtime-v2-*-usage` | runtime마다 USAGE_LOGS를 위 log group으로 보냄 |
| log resource policy | `agentcore-runtime-v2-usage-delivery` | `delivery.logs.amazonaws.com`의 쓰기 권한. 계정 공용 정책을 건드리지 않으려고 따로 둠 |

세 runtime은 같은 이미지와 같은 환경 변수(`INIT_SECONDS=20`, `INIT_MEMORY_MB=512`)를 씁니다. platform version만 다릅니다.

## 1. AWS profile 지정

Terraform 코드와 스크립트에는 profile을 적지 않았습니다. 셸에서 사용할 profile과 리전을 먼저 지정합니다. 이 문서와 시나리오의 `aws` 명령은 `--region` 없이 이 리전을 씁니다.

```bash
cd aws/bedrock/agentcore-runtime-v2
export AWS_PROFILE=<로컬 profile>
export AWS_REGION=ap-northeast-2
```

## 2. ECR 저장소 생성과 이미지 push

runtime은 생성 시점에 이미지가 있어야 하므로 ECR 저장소만 먼저 만듭니다.

```bash
terraform -chdir=terraform init
terraform -chdir=terraform apply -target=aws_ecr_repository.agent
```

[push-image.sh](../scripts/push-image.sh)가 [agent/](../agent/)를 `linux/arm64`로 빌드해 `v1` tag로 push합니다. AgentCore Runtime microVM은 arm64입니다.

```bash
scripts/push-image.sh v1
```

## 3. runtime 3개 생성

나머지 리소스를 만듭니다. V2 runtime은 snapshot을 준비하느라 몇 분이 걸립니다. 걸린 시간은 [시나리오 2](./2-snapshot-cold-start.md)에서 비교합니다.

```bash
terraform -chdir=terraform apply
terraform -chdir=terraform output -raw runtime_env > .runtime.env
```

`.runtime.env`에는 runtime ARN이 들어갑니다. ID 접미사는 생성할 때마다 달라집니다.

```text
AWS_REGION=ap-northeast-2
USAGE_LOG_GROUP=/aws/vendedlogs/bedrock-agentcore/agentcore-runtime-v2/usage
RUNTIME_DEFAULT_ARN=arn:aws:bedrock-agentcore:ap-northeast-2:<계정 ID>:runtime/rtv2_default-<ID>
RUNTIME_LEGACY_ARN=arn:aws:bedrock-agentcore:ap-northeast-2:<계정 ID>:runtime/rtv2_legacy-<ID>
RUNTIME_V2_ARN=arn:aws:bedrock-agentcore:ap-northeast-2:<계정 ID>:runtime/rtv2_v2-<ID>
```

## 4. 측정 스크립트 동작 확인

[runtime.py](../scripts/runtime.py)는 `GetAgentRuntime`과 `InvokeAgentRuntime`을 boto3로 호출합니다. `status`가 세 runtime 모두 `READY`이면 준비가 끝났습니다.

```bash
uv run --env-file .runtime.env scripts/runtime.py status
```

| subcommand | 호출 API | 하는 일 |
|---|---|---|
| `status` | `GetAgentRuntime` | runtime별 `platformVersion`, `status`, `agentRuntimeVersion` |
| `cold --runtime <이름>` | `InvokeAgentRuntime` | 매번 새 `runtimeSessionId`로 호출해 cold start 지연을 잼 |
| `warm --runtime <이름>` | `InvokeAgentRuntime` | 같은 session으로 반복 호출 |
| `burst --runtime <이름> --count N` | `InvokeAgentRuntime` | 새 session N개를 동시에 호출하고 p50, p75, max 출력 |
| `memory --runtime <이름>` | `InvokeAgentRuntime`, `StopRuntimeSession` | session 하나에서 대기, 메모리 확보, 해제, 대기 후 session 종료 |
| `usage --session <ID>` | CloudWatch Logs `FilterLogEvents` | USAGE_LOGS를 30초 단위로 묶어 평균 메모리(GB)와 vCPU 출력 |
| `call --runtime <이름> --action info\|alloc\|free` | `InvokeAgentRuntime` | session 하나에 action 하나를 보냄 |

## 5. 정리

실습이 끝나면 모든 리소스를 지웁니다. AgentCore Runtime은 호출한 만큼만 과금되지만 ECR 이미지 저장 비용은 남아 있는 동안 계속 나갑니다.

```bash
terraform -chdir=terraform destroy
```

runtime이 만든 CloudWatch log group(`/aws/bedrock-agentcore/runtimes/<runtime ID>-DEFAULT`)은 Terraform이 관리하지 않으므로 따로 지웁니다.

```bash
aws logs describe-log-groups --log-group-name-prefix /aws/bedrock-agentcore/runtimes/rtv2_ \
  --query 'logGroups[].logGroupName' --output text | tr '\t' '\n' |
  xargs -I{} aws logs delete-log-group --log-group-name {}
```

남은 runtime이 없는지 확인합니다. 빈 목록이 나오면 정리가 끝났습니다.

```bash
aws bedrock-agentcore-control list-agent-runtimes --query 'agentRuntimes[].agentRuntimeName'
```
