# desired count를 바꾸고 task 개수를 확인하는 실습

desired count를 1 → 3 → 2로 바꾸면서 콘솔, CLI, Terraform이 각각 무엇을 보여주는지 비교합니다. 마지막에 task를 강제로 멈춰 service scheduler가 개수를 되돌리는지 확인합니다. 배경 개념은 [1-concept.md](./1-concept.md)에 있습니다.

## 준비: 환경을 만들고 변수를 잡습니다

[setup.md](./setup.md)의 Up으로 환경을 만듭니다. 이후 명령은 모두 workspace 루트에서 실행하고, 아래 세 변수를 모든 단계에서 사용합니다. 터미널을 새로 열면 이 블록을 다시 실행합니다.

```bash
cd aws/ecs/desired-count  # 저장소 루트 기준
ALB=$(terraform -chdir=terraform output -raw alb_dns_name)
CLUSTER=$(terraform -chdir=terraform output -raw cluster_name)
SERVICE=$(terraform -chdir=terraform output -raw service_name)
```

로컬 컨테이너가 ECS와 같은 응답을 주는지 먼저 봅니다. 응답 형식을 알아 두면 이후 ALB 응답을 읽기 쉽습니다.

```bash
curl -s http://localhost:8080/
```

`hostname=`과 `server_addr=` 두 줄이 나오면 됩니다.

## 1. desired count 1에서는 hostname이 하나입니다

ALB를 10번 호출하고 hostname별로 셉니다.

```bash
for i in $(seq 1 10); do curl -s http://$ALB/ | head -1; done | sort | uniq -c
```

확인할 것:

- hostname이 1종류만 10번 나옵니다.
- 콘솔 **ECS > Clusters > ecs-desired-count > Tasks**에서 task를 열고 **Private IP**를 봅니다. 응답의 `server_addr`와 같은 값입니다. Fargate task는 자기 ENI를 가지므로 nginx가 받은 주소가 곧 task의 private IP입니다.

## 2. 콘솔에서 desired count를 3으로 바꿉니다

1. **ECS > Clusters > ecs-desired-count > Services > ecs-desired-count-web**을 엽니다.
2. **Update service**를 누르고 **Desired tasks**를 `3`으로 바꿔 저장합니다.

바꾼 직후 네 곳을 번갈아 봅니다.

| 위치 | 볼 것 |
| --- | --- |
| Service 상세 | Desired, Pending, Running 숫자 |
| Service의 **Events** 탭 | `has started 2 tasks` 이벤트 |
| Service의 **Tasks** 탭 | Health status가 `UNKNOWN`에서 `HEALTHY`로 바뀌는 시점 |
| **EC2 > Target groups > ecs-desired-count-web > Targets** | 새 target이 `initial`에서 `healthy`로 바뀌는 시점 |

확인할 것:

- Running이 3이 된 시점보다 target 3개가 모두 `healthy`가 되는 시점이 늦습니다. healthy_threshold 2, interval 10초라서 최소 20초 차이가 납니다.
- 모든 target이 `healthy`가 된 뒤 1단계의 curl을 다시 실행하면 hostname 3종류가 섞여 나옵니다.

## 3. ALB 호출과 task 직접 호출을 비교합니다

task마다 private IP와 public IP를 출력합니다. task ENI ID를 찾고, ENI에서 IP를 읽는 두 단계입니다.

```bash
for ENI in $(aws ecs describe-tasks --cluster $CLUSTER \
    --tasks $(aws ecs list-tasks --cluster $CLUSTER --service-name $SERVICE --query 'taskArns' --output text) \
    --query 'tasks[].attachments[].details[?name==`networkInterfaceId`].value' --output text); do
  aws ec2 describe-network-interfaces --network-interface-ids $ENI \
    --query 'NetworkInterfaces[0].[PrivateIpAddress,Association.PublicIp]' --output text
done
```

출력된 public IP 하나로 task를 직접 5번 호출합니다. task security group이 내 IP의 80 포트를 허용하므로 ALB를 거치지 않고 닿습니다.

```bash
TASK_IP=<task-public-ip>
for i in $(seq 1 5); do curl -s http://$TASK_IP/ | head -1; done
```

확인할 것:

- task 직접 호출은 항상 같은 hostname이 나옵니다.
- ALB 호출은 여러 hostname이 나옵니다.

질문: task 직접 호출은 target group health check 결과와 관계없이 응답할까요? 2단계를 다시 할 때 target이 `initial`인 새 task를 직접 호출해 보면 확인할 수 있습니다. 답은 [3-review.md](./3-review.md)에 있습니다.

## 4. CLI로 현재 개수를 확인합니다

```bash
aws ecs describe-services --cluster $CLUSTER --services $SERVICE \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}'
```

확인할 것: `desired`, `running` 모두 3, `pending`은 0입니다. 콘솔 숫자와 같은 API 값입니다.

## 5. Terraform은 콘솔 변경을 drift로 봅니다

콘솔에서 3으로 바꿨지만 Terraform 변수 `desired_count`는 여전히 기본값 1입니다.

```bash
terraform -chdir=terraform plan
```

확인할 것: `aws_ecs_service.web`에 `~ desired_count = 3 -> 1`이 나옵니다. plan은 API에서 현재 값 3을 읽고, 코드의 1로 되돌리겠다고 제안합니다.

state에는 어떤 값이 있는지 봅니다.

```bash
terraform -chdir=terraform state show aws_ecs_service.web | grep count
```

확인할 것:

- `desired_count = 1`만 나옵니다. plan은 state 파일을 갱신하지 않으므로 마지막 apply 시점의 값이 남아 있습니다.
- `running_count`, `pending_count` 속성은 없습니다. resource는 선언한 값만 관리합니다.

질문: data source `aws_ecs_service`로는 runningCount를 볼 수 있을까요? 이 workspace에는 `observe_counts` 변수를 켜면 data source로 개수를 읽는 output이 들어 있습니다.

```bash
terraform -chdir=terraform plan -var observe_counts=true
```

확인할 것:

- **Changes to Outputs**에 `observed_counts = { desired = 3, pending = 0, running = 3 }`이 나옵니다. data source는 AWS provider 6.21.0부터 `running_count`를 노출합니다.
- 같은 plan에서 resource는 여전히 `3 -> 1`입니다. data source는 API의 현재 값을, resource는 코드와 API의 차이를 보여줍니다.

## 6. Terraform으로 desired count를 2로 바꿉니다

```bash
terraform -chdir=terraform apply -var desired_count=2
```

plan에 `~ desired_count = 3 -> 2`가 나오면 `yes`를 입력합니다.

확인할 것:

- **Target groups > Targets**에서 target 1개가 `draining`으로 바뀌고, 약 10초(`deregistration_delay`) 뒤 사라집니다.
- 그 task는 Tasks 탭에서 `STOPPED`로 바뀝니다.
- 1단계 curl을 다시 실행하면 hostname 2종류가 나옵니다.

`-var`로 넘긴 값은 저장되지 않습니다. 이후 `-var` 없이 apply하면 desired count가 다시 1로 돌아갑니다.

## 7. task를 강제로 멈추면 scheduler가 다시 띄웁니다

다른 터미널에서 준비 단계의 변수를 잡고, 개수를 2초마다 출력해 둡니다. 출력 순서는 desired, running, pending입니다.

```bash
while true; do aws ecs describe-services --cluster $CLUSTER --services $SERVICE --query 'services[0].[desiredCount,runningCount,pendingCount]' --output text; sleep 2; done
```

원래 터미널에서 task 하나를 멈춥니다.

```bash
TASK=$(aws ecs list-tasks --cluster $CLUSTER --service-name $SERVICE --query 'taskArns[0]' --output text)
aws ecs stop-task --cluster $CLUSTER --task $TASK --reason "handson self-healing" --query 'task.lastStatus'
```

확인할 것:

- desired는 2로 그대로이고, pending이 1로 오른 뒤 running이 2로 돌아옵니다. running이 1로 내려가는 시점과 pending이 오르는 시점의 순서는 draining 시간에 따라 다를 수 있으니 출력에서 직접 봅니다.
- Events 탭에 새 task를 띄운 `has started 1 tasks` 이벤트가 생깁니다.

멈춘 task에 남은 이유를 봅니다.

```bash
aws ecs describe-tasks --cluster $CLUSTER --tasks $TASK --query 'tasks[0].[lastStatus,stoppedReason]' --output text
```

확인할 것: `stoppedReason`에 `--reason`으로 넘긴 문구가 남습니다.

3단계의 IP 조회와 1단계의 curl을 다시 실행합니다.

확인할 것: 새 task는 이전 task와 hostname, private IP, public IP가 모두 다릅니다.

## 8. 이벤트 이력으로 task 상태 전환을 읽습니다

1~7단계의 콘솔 화면은 지금 상태만 보여줍니다. service Events 탭은 최근 100개만 남고, 멈춘 task는 1시간이 지나면 목록에서 사라집니다. 이 workspace의 Terraform(`terraform/ecs_event_logs.tf`)은 두 가지 기록을 켜 두었습니다. 보존 기간은 둘 다 1일입니다.

| 기록 | log group | 남는 것 |
| --- | --- | --- |
| event capture | `/aws/events/ecs/containerinsights/ecs-desired-count/performance` | ECS가 내보내는 모든 이벤트. task 상태 전환, service action, 배포 상태 |
| Action Logs | `/aws/vendedlogs/ecs/action-logs/ecs-desired-count` | service 배포 단위의 진행 기록 |

콘솔 **ECS > Clusters > ecs-desired-count > Event history** 탭은 event capture log group을 조회합니다. CLI로는 task 상태 전환만 골라 시간순으로 출력합니다. 출력 열은 시각, task ID 앞 8자리, lastStatus, desiredStatus, stopCode입니다.

```bash
aws logs filter-log-events --log-group-name /aws/events/ecs/containerinsights/$CLUSTER/performance --output json \
  | jq -r '.events[].message | fromjson | select(."detail-type" == "ECS Task State Change") | [.time, (.detail.taskArn | split("/")[-1][0:8]), .detail.lastStatus, .detail.desiredStatus, (.detail.stopCode // "")] | @tsv'
```

확인할 것:

- 새 task는 `PROVISIONING` → `PENDING` → `ACTIVATING` → `RUNNING` 순서로 기록됩니다. `PROVISIONING`에서 `PENDING`까지가 Fargate 용량 확보와 ENI 연결에 걸린 시간입니다.
- scale-in이나 7단계에서 멈춘 task는 `DEACTIVATING` → `STOPPING` → `DEPROVISIONING` → `STOPPED` 순서이고, stopCode가 남습니다. scheduler가 멈춘 task는 `ServiceSchedulerInitiated`입니다.

Action Logs는 desired count만 바꿔서는 남지 않습니다. desired count 변경은 새 배포를 만들지 않기 때문입니다. 새 배포를 만들어 비교합니다.

```bash
aws ecs update-service --cluster $CLUSTER --service $SERVICE --force-new-deployment --query 'service.deployments[0].rolloutState'
```

배포가 끝나면 Action Logs를 읽습니다.

```bash
aws logs filter-log-events --log-group-name /aws/vendedlogs/ecs/action-logs/$CLUSTER --log-stream-name-prefix service/ --output json \
  | jq -r '.events[].message | fromjson | [(.eventTimestamp / 1000 | todate), .logLevel, .detail.eventName, .detail.statusReason] | @tsv'
```

확인할 것: `SERVICE_DEPLOYMENT_IN_PROGRESS`, `SERVICE_REVISION_STABLE`, `SERVICE_DEPLOYMENT_SUCCESSFUL` 세 줄이 나옵니다. `SERVICE_REVISION_STABLE`의 statusReason에는 배포에 고정된 이미지 digest가 남습니다.

실습을 마치면 [3-review.md](./3-review.md)의 질문에 답해 보고, [setup.md](./setup.md)의 Down으로 리소스를 지웁니다.
