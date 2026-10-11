# 부하로 task 개수를 늘리고 줄이는 실습

k6로 ALB에 일정한 요청률을 걸어 desired count가 1 → 3으로 늘고, 부하가 끝나면 3 → 2 → 1로 줄어드는 과정을 봅니다. 그 사이 SNS 알림, scaling activity, event capture를 확인합니다. 배경 개념은 [1-concept.md](./1-concept.md)에 있습니다.

## 준비: 환경을 만들고 변수를 잡습니다

[setup.md](./setup.md)의 Up으로 환경을 만듭니다. 이후 명령은 모두 workspace 루트에서 실행하고, 아래 변수를 모든 단계에서 사용합니다. 터미널을 새로 열면 이 블록을 다시 실행합니다.

```bash
cd aws/ecs/service-autoscaling  # 저장소 루트 기준
ALB=$(terraform -chdir=terraform output -raw alb_dns_name)
CLUSTER=$(terraform -chdir=terraform output -raw cluster_name)
SERVICE=$(terraform -chdir=terraform output -raw service_name)
RESOURCE_ID=service/$CLUSTER/$SERVICE
```

k6 스크립트가 동작하는지 로컬 컨테이너로 먼저 10초 돌려 봅니다. `RATE`는 초당 요청 수입니다.

```bash
RATE=30 DURATION=10s k6 run k6/load.js
```

확인할 것: `checks_succeeded`가 100%, `http_reqs`가 약 300입니다.

## 1. 만들어진 scaling 구성을 확인합니다

scalable target과 policy가 무엇으로 등록됐는지 봅니다.

```bash
aws application-autoscaling describe-scalable-targets --service-namespace ecs \
  --resource-ids $RESOURCE_ID \
  --query 'ScalableTargets[0].{min:MinCapacity,max:MaxCapacity,role:RoleARN}'
```

확인할 것: `min` 1, `max` 3, `role`은 `AWSServiceRoleForApplicationAutoScaling_ECSService`입니다. Terraform 코드에는 이 role이 없습니다.

policy가 만든 alarm 두 개를 봅니다.

```bash
aws cloudwatch describe-alarms --alarm-name-prefix TargetTracking-$RESOURCE_ID \
  --query 'MetricAlarms[].[AlarmName,ComparisonOperator,Threshold,EvaluationPeriods,StateValue]' --output table
```

확인할 것:

- AlarmHigh는 `GreaterThanThreshold` 600, 평가 3회입니다.
- AlarmLow는 `LessThanThreshold` 540, 평가 15회입니다.
- 트래픽이 없으면 둘 다 `INSUFFICIENT_DATA`입니다.

## 2. 부하를 걸어 scale-out을 봅니다

초당 30 요청(분당 1800)을 12분 동안 겁니다. task 1개면 target당 분당 1800이라 목표 600의 3배입니다. 이 터미널은 k6가 차지하므로 이후 명령은 새 터미널에서 준비 블록을 다시 실행하고 씁니다.

```bash
BASE_URL=http://$ALB RATE=30 DURATION=12m k6 run k6/load.js
```

새 터미널에서 개수와 alarm 상태를 20초마다 출력합니다.

```bash
while true; do
  echo "$(date +%T) $(aws ecs describe-services --cluster $CLUSTER --services $SERVICE \
    --query 'services[0].[desiredCount,runningCount,pendingCount]' --output text) \
    $(aws cloudwatch describe-alarms --alarm-name-prefix TargetTracking-$RESOURCE_ID \
    --query 'MetricAlarms[].StateValue' --output text)"
  sleep 20
done
```

출력은 desired, running, pending, AlarmHigh, AlarmLow 순서입니다. 실습에서는 아래처럼 바뀌었습니다. 시각은 KST이고, [1-concept.md](./1-concept.md)의 표는 UTC(KST - 9시간)입니다.

```text
14:22:53 1 1 0 INSUFFICIENT_DATA OK
14:23:14 3 1 2 ALARM OK
14:23:56 3 3 0 ALARM OK
```

확인할 것:

- 부하를 건 뒤 약 5분 지나 AlarmHigh가 `ALARM`이 되고 desired가 1에서 3으로 한 번에 바뀝니다.
- pending 2가 40초쯤 뒤 running으로 넘어갑니다.

## 3. 누가 desired count를 바꿨는지 확인합니다

scaling activity에는 원인 alarm과 policy가 남습니다.

```bash
aws application-autoscaling describe-scaling-activities --service-namespace ecs \
  --resource-id $RESOURCE_ID \
  --query 'ScalingActivities[].[StartTime,Description,Cause]' --output text
```

확인할 것: `Setting desired count to 3.`와 함께 `monitor alarm TargetTracking-...-AlarmHigh-... in state ALARM triggered policy ecs-service-autoscaling-requests-per-task`가 나옵니다.

Terraform이 이 변경을 drift로 보는지 확인합니다.

```bash
terraform -chdir=terraform plan
```

확인할 것: `No changes`입니다. `ignore_changes = [desired_count]`를 지우고 다시 plan하면 `desired_count = 3 -> 1`이 나옵니다. 지운 줄은 되돌려 둡니다.

## 4. scaling 중 task 상태 전환을 봅니다

콘솔 **ECS > Clusters > ecs-service-autoscaling > Services > ecs-service-autoscaling-web**의 **Events** 탭에서 `has started 2 tasks`, `registered 2 targets`, `has reached a steady state`를 차례로 봅니다.

event capture log group에는 task마다 상태 전환이 남습니다. 콘솔 클러스터의 **Event history** 탭이 같은 log group을 조회합니다. CLI로 최근 30분을 읽습니다.

```bash
aws logs filter-log-events \
  --log-group-name /aws/events/ecs/containerinsights/$CLUSTER/performance \
  --start-time $(( ($(date +%s) - 1800) * 1000 )) --query 'events[].message' --output json \
  | jq -r '.[] | fromjson | [.time, ."detail-type", (.detail.eventName // .detail.lastStatus), (.detail.taskArn // "" | split("/")[-1][0:8])] | @tsv' \
  | sort
```

확인할 것: 새 task 두 개가 `PROVISIONING → PENDING → ACTIVATING → RUNNING` 순서로 바뀌고 마지막에 `SERVICE_STEADY_STATE`가 나옵니다.

Action Logs도 읽어 봅니다.

```bash
aws logs filter-log-events --log-group-name /aws/vendedlogs/ecs/action-logs/$CLUSTER \
  --query 'events[].message' --output json \
  | jq -r '.[] | (fromjson? // empty) | [(.eventTimestamp/1000|todate), .detail.eventName] | @tsv'
```

확인할 것: 첫 apply의 배포 이벤트 세 줄(`SERVICE_DEPLOYMENT_IN_PROGRESS`, `SERVICE_REVISION_STABLE`, `SERVICE_DEPLOYMENT_SUCCESSFUL`)만 있고 scale-out 시점의 기록은 없습니다.

## 5. scaling 알림이 전달됐는지 확인합니다

`alert_email`을 지정했다면 메일이 두 통 와 있습니다. 하나는 AlarmHigh가 `ALARM`이 된 alarm 이벤트, 다른 하나는 desired count가 max 3에 닿은 Application Auto Scaling 이벤트입니다.

메일을 구독하지 않았으면 지표로 전달을 확인합니다.

```bash
for RULE in ecs-service-autoscaling-scaling-alarm ecs-service-autoscaling-scaled-to-max; do
  echo "$RULE $(aws cloudwatch get-metric-statistics --namespace AWS/Events --metric-name Invocations \
    --dimensions Name=RuleName,Value=$RULE \
    --start-time $(date -u -v-30M +%FT%TZ) --end-time $(date -u +%FT%TZ) \
    --period 1800 --statistics Sum --query 'Datapoints[0].Sum' --output text)"
done
```

확인할 것: 두 rule 모두 1입니다. `date -v`는 macOS 문법이고, Linux에서는 `date -u -d '-30 min' +%FT%TZ`로 바꿉니다.

질문: desired count가 1에서 2로만 늘었다면 알림은 몇 통일까요? 답은 [3-review.md](./3-review.md)에 있습니다.

## 6. 부하가 끝나면 scale-in을 봅니다

12분 부하가 끝나면 k6가 스스로 멈춥니다. 2단계의 반복 출력을 그대로 두고 약 20분 기다립니다. 실습에서는 아래처럼 바뀌었습니다.

```text
14:30:14 3 3 0 OK OK
14:47:43 2 2 0 OK ALARM
14:49:47 1 1 0 OK ALARM
```

확인할 것:

- 부하가 끝나고 약 17분 뒤 AlarmLow가 `ALARM`이 됩니다. 15분 연속 datapoint에 지표 지연이 더해진 시간입니다.
- 요청이 0이어도 ALB는 target이 등록돼 있는 동안 `RequestCountPerTarget`을 `0.0`으로 보냅니다. 그래서 alarm이 `INSUFFICIENT_DATA`가 되지 않고 scale-in이 일어납니다.
- desired가 3에서 1로 한 번에 가지 않고 3 → 2 → 1로 2분 간격을 두고 줄어듭니다. scale-out은 지표에 비례해 한 번에 늘리고 scale-in은 한 칸씩 줄입니다.
- 3단계의 scaling activity 명령을 다시 실행하면 `AlarmLow ... in state ALARM`이 원인인 활동 두 개가 추가돼 있습니다.

event capture에는 줄어든 task마다 `DEACTIVATING → STOPPING → DEPROVISIONING → STOPPED`가 남고, `stoppedReason`은 `Scaling activity initiated by (deployment ...)`입니다. 4단계의 event capture 명령에서 jq 필드에 `.detail.stoppedReason`을 추가하면 보입니다.

알림은 한 통 더 옵니다. scale-in은 두 번 일어났지만 AlarmLow가 `ALARM`으로 바뀐 것은 한 번이라 `scaling-alarm` rule도 한 번만 실행됩니다. min 1은 max가 아니므로 `scaled-to-max` 이벤트는 없습니다.

## 정리

[setup.md](./setup.md)의 Down으로 리소스를 지웁니다.
