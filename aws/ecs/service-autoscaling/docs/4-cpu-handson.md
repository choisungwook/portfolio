# ECS Exec로 CPU를 올려 scale-out을 보는 실습

요청 수 대신 service 평균 CPU(`ECSServiceAverageCPUUtilization`)로 target tracking을 겁니다. nginx는 고정 문자열만 반환해서 요청으로는 CPU가 오르지 않으므로, ECS Exec로 컨테이너에 들어가 `yes`를 돌려 CPU를 직접 올립니다. 요청 수 시나리오와 다른 점은 부하가 service 전체가 아니라 접속한 task 하나에만 걸린다는 것입니다.

## 준비: CPU policy로 환경을 만듭니다

[setup.md](./setup.md)의 Up에서 apply 뒤에 `-var scaling_metric=cpu`를 붙입니다. 이 값이면 요청 수 policy 대신 CPU policy(`target_cpu_percent = 50`)가 만들어집니다.

```bash
cd aws/ecs/service-autoscaling  # 저장소 루트 기준
terraform -chdir=terraform apply -var scaling_metric=cpu
CLUSTER=$(terraform -chdir=terraform output -raw cluster_name)
SERVICE=$(terraform -chdir=terraform output -raw service_name)
RESOURCE_ID=service/$CLUSTER/$SERVICE
```

ECS Exec가 동작하려면 세 가지가 필요합니다. 이 workspace의 Terraform이 모두 만듭니다.

| 조건 | 이 workspace에서 |
| --- | --- |
| service의 `enable_execute_command = true` | `terraform/ecs.tf` |
| task role에 `ssmmessages:CreateControlChannel`, `CreateDataChannel`, `OpenControlChannel`, `OpenDataChannel` | `terraform/iam.tf`의 `aws_iam_role.task`. execution role이 아닙니다. |
| task가 SSM 엔드포인트에 닿는 경로 | default VPC public subnet과 `assign_public_ip = true`. private subnet이면 NAT나 `ssmmessages` VPC endpoint가 필요합니다. |

컨테이너 이미지에는 `sh`, `yes`, `timeout`이 있어야 합니다. `nginx:stable-alpine`은 셋 다 있습니다. distroless 이미지는 쉘이 없어 이 방법을 쓸 수 없습니다.

task가 ECS Exec를 받을 준비가 됐는지 확인합니다.

```bash
TASK1=$(aws ecs list-tasks --cluster $CLUSTER --service-name $SERVICE --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster $CLUSTER --tasks $TASK1 \
  --query 'tasks[0].[enableExecuteCommand,containers[0].managedAgents[0].lastStatus]' --output text
```

확인할 것: `True RUNNING`입니다.

CPU policy가 만든 alarm을 봅니다.

```bash
aws cloudwatch describe-alarms --alarm-name-prefix TargetTracking-$RESOURCE_ID \
  --query 'MetricAlarms[].[AlarmName,MetricName,Threshold,EvaluationPeriods]' --output table
```

확인할 것: `CPUUtilization` 지표로 AlarmHigh는 50 초과 3회, AlarmLow는 45 미만 15회입니다.

## 1. 첫 task에 CPU 부하를 겁니다

ECS Exec로 `yes`를 15분 동안 돌립니다. `timeout`이 끝나면 부하도 끝납니다. 세션을 닫으면 그 안에서 띄운 프로세스도 끝날 수 있으므로(확인하지 않음), 이 터미널은 부하가 끝날 때까지 그대로 둡니다.

```bash
aws ecs execute-command --cluster $CLUSTER --task $TASK1 --container web \
  --interactive --command "timeout 900 sh -c 'yes > /dev/null'"
```

task CPU는 0.25 vCPU(`cpu = 256`)라서 `yes` 하나로 100%가 됩니다. vCPU가 1보다 큰 task라면 vCPU 수만큼 `yes`를 띄워야 100%가 됩니다.

새 터미널에서 준비 블록의 변수를 다시 잡고, 개수와 alarm 상태를 20초마다 출력합니다.

```bash
while true; do
  echo "$(date +%T) $(aws ecs describe-services --cluster $CLUSTER --services $SERVICE \
    --query 'services[0].[desiredCount,runningCount]' --output text) \
    $(aws cloudwatch describe-alarms --alarm-name-prefix TargetTracking-$RESOURCE_ID \
    --query 'MetricAlarms[].StateValue' --output text)"
  sleep 20
done
```

출력은 desired, running, AlarmHigh, AlarmLow 순서입니다. 실습에서는 아래처럼 바뀌었습니다. 이 문서의 시각은 KST이고, [1-concept.md](./1-concept.md)의 표는 UTC(KST - 9시간)입니다.

```text
15:07:36 1 1 OK ALARM
15:10:41 2 1 ALARM OK
15:11:12 2 2 ALARM OK
```

확인할 것:

- 부하를 건 뒤 약 5.5분 지나 desired가 1에서 2로 늘어납니다. CPU는 100%인데 목표가 50이라 `1 × 100 / 50 = 2`입니다.
- 실습에서는 부하 전부터 AlarmLow가 `ALARM`이었습니다. alarm 기록의 이유를 보면 생성 직후 이전 실습의 CPU datapoint 10개(0.5% 안팎)를 읽었습니다. CloudWatch 지표는 `ClusterName`, `ServiceName` 이름으로 묶이므로 같은 이름으로 다시 만든 service는 지운 service의 지표를 이어받습니다. min 1이라 줄일 task는 없었습니다.

## 2. 새 task에도 부하를 겁니다

`yes`는 접속한 task 하나에서만 돕니다. 새로 뜬 task는 idle이라 service 평균 CPU가 `(100 + 0) / 2 = 50`으로 희석됩니다. AlarmHigh 조건은 50 초과라서 이대로면 더 늘어나지 않습니다. 실습에서도 새 task가 붙은 직후 AlarmHigh가 잠시 `OK`로 돌아갔습니다.

새 task ID를 찾고 같은 방법으로 부하를 겁니다. 이 명령도 별도 터미널에서 실행하고 세션을 유지합니다.

```bash
aws ecs list-tasks --cluster $CLUSTER --service-name $SERVICE --query 'taskArns' --output text
TASK2=<1단계 TASK1이 아닌 task ARN>
aws ecs execute-command --cluster $CLUSTER --task $TASK2 --container web \
  --interactive --command "timeout 600 sh -c 'yes > /dev/null'"
```

실습에서는 아래처럼 바뀌었습니다.

```text
15:13:47 2 2 OK OK
15:16:53 3 2 ALARM OK
15:17:24 3 3 ALARM OK
```

확인할 것:

- 두 task 모두 100%가 되면 `2 × 100 / 50 = 4`지만 `max_capacity` 3에서 멈춥니다.
- 세 번째 task에는 부하를 걸지 않아도 평균이 약 67%라 3개가 유지됩니다.
- 부하 시간은 첫 task 15분, 두 번째 task 10분입니다. AlarmHigh는 1분 datapoint 3개가 연속으로 50%를 넘어야 하고 지표가 1~2분 늦게 들어와서, 실습에서는 부하를 건 뒤 alarm까지 약 5.5분 걸렸습니다. 2분짜리 부하는 alarm이 울리기 전에 끝납니다.

## 3. scaling 기록과 알림을 확인합니다

[2-handson.md](./2-handson.md)의 3단계와 5단계 명령을 그대로 실행합니다.

확인할 것:

- scaling activity에 `Setting desired count to 2.`, `Setting desired count to 3.`이 CPU AlarmHigh 원인으로 남습니다.
- `scaling-alarm` rule은 15:10과 15:16에 실행됩니다. `scaled-to-max` rule은 15:17에 한 번 실행됩니다.
- 실습에서는 `scaling-alarm`이 15:04에도 한 번 실행됐습니다. 앞에서 본 AlarmLow `ALARM`이 원인입니다. min 1이라 scaling은 없었는데 알림만 왔습니다. alarm 상태 변화로 알림을 받으면 실제 scaling이 없는 알림도 섞입니다.
- 이전 실습을 destroy한 뒤 같은 이름으로 다시 만들었는데 scaling activity 목록에 이전 실습의 활동도 함께 나옵니다. activity는 `resource_id`(`service/<cluster>/<service>`) 이름으로 조회되기 때문입니다.

## 4. 부하가 끝나면 scale-in을 봅니다

부하가 끝나면 CPU가 45% 아래로 내려가고, AlarmLow가 15분 연속 datapoint를 채운 뒤 desired가 줄어듭니다. 실습에서는 두 번째 task의 부하가 15:21에 끝났고, 15:38:53에 3 → 2, 15:40:53에 2 → 1이 됐습니다. 요청 수 시나리오처럼 약 17분 뒤 한 칸씩 줄었습니다.

## 정리

[setup.md](./setup.md)의 Down으로 리소스를 지웁니다. 마지막 apply에 붙인 `-var scaling_metric=cpu`를 destroy에도 똑같이 붙입니다.
