# 정리 질문

실습에서 본 것을 근거로 먼저 스스로 답해 보고, 각 질문 아래의 답과 비교합니다.

## task 직접 호출은 target group health check와 관계없이 응답할까요?

답:

응답합니다. target group health check는 ALB가 어느 target으로 트래픽을 보낼지 정하는 기준일 뿐이고, task의 nginx는 그 결과를 모릅니다. task security group이 내 IP를 허용하므로 target이 `initial`이거나 `unhealthy`여도 직접 호출은 닿습니다. 단, target group health check가 계속 실패하면 ECS service scheduler가 task를 교체하므로 그 task는 오래 남지 않습니다.

## desiredCount를 3으로 바꾼 직후 runningCount가 3이 되어도 트래픽을 바로 받지 못하는 이유는?

답:

`runningCount`는 task 상태가 `RUNNING`인 수이고, ALB가 트래픽을 보내는 기준은 target 상태가 `healthy`인지입니다. 새 task는 `ACTIVATING` 단계에서 target group에 `initial`로 등록되고, ALB health check를 interval 10초로 2번 연속 통과해야 `healthy`가 됩니다. 그 전까지 ALB는 기존 task로만 트래픽을 보냅니다.

## 컨테이너 health check가 실패하면 ECS와 ALB는 각각 어떻게 동작할까요?

답:

- ECS: 3번 연속(`retries`) 실패하면 컨테이너를 `UNHEALTHY`로 표시합니다. essential 컨테이너가 `UNHEALTHY`면 task가 `UNHEALTHY`가 되고, service scheduler가 그 task를 멈추고 새 task를 띄웁니다.
- ALB: 컨테이너 health check 결과를 보지 않습니다. 자기 health check(`/health`)만 봅니다. ECS가 task를 멈추면서 target을 등록 해제할 때 `draining`으로 바뀌고 트래픽에서 빠집니다.

이 핸즈온은 두 health check가 같은 `/health`를 보므로 보통 함께 실패합니다. 경로를 다르게 두면 한쪽만 실패하는 상황을 만들 수 있습니다.

## Terraform으로 desired count를 관리하면서 콘솔에서 바꾸면 어떤 문제가 생길까요?

답:

다음 `terraform apply`가 콘솔에서 바꾼 값을 코드 값으로 되돌립니다. 장애 중에 콘솔로 3으로 늘려 두었는데 다른 변경을 apply하면 같은 plan에 `3 -> 1`이 섞여 들어가 의도하지 않은 scale-in이 일어납니다. plan을 읽지 않고 apply하면 놓치기 쉽습니다.

개수를 Terraform 밖에서 바꾸는 운영(Service Auto Scaling, 콘솔 수동 조정)을 허용하려면 `lifecycle { ignore_changes = [desired_count] }`로 Terraform이 개수를 생성 시점에만 정하게 둡니다. 대신 Terraform 코드만 보고는 현재 개수를 알 수 없게 됩니다.

## task public IP가 task를 교체할 때마다 바뀌는 이유는?

답:

Fargate task는 `awsvpc` 모드라 task마다 ENI가 새로 만들어지고, `assign_public_ip = true`면 그 ENI에 AWS public IP pool의 주소가 붙습니다. task가 멈추면 ENI가 삭제되면서 주소도 반납되고, 새 task는 새 ENI와 새 주소를 받습니다. 고정 주소가 필요하면 task IP가 아니라 ALB DNS 이름이나 NLB 같은 고정 진입점을 앞에 둡니다.
