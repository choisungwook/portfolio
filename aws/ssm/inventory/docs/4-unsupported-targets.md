# 시나리오 4. ECS·Lambda가 Inventory 대상이 아닌 이유

## 이 시나리오의 목표

| 항목 | 내용 |
| --- | --- |
| 기능 | Inventory의 대상 제약(managed node 전용) |
| 쓰는 도구 | `scripts/probe_targets.py` |
| 입력 | EC2 managed node ID, ECS task·Lambda 형식의 가짜 ID |
| 작업 | 1 대상별 PutInventory 호출 → 2 오류 코드 해석 |
| 달성할 것 | ECS task와 Lambda가 거부되는 지점과 이유, 대신 쓸 도구 정리 |

## 왜 거부되는가

Inventory의 저장 키는 managed node ID입니다. SSM은 Agent가 등록할 때 받은 `i-`(EC2) 또는 `mi-`(하이브리드) ID만 노드로 압니다. 거부는 두 단계에서 일어납니다.

1. **형식 검증**: `InstanceId`가 `(^i-(\w{8}|\w{17})$)|(^mi-\w{17}$)`에 맞지 않으면 노드 조회 전에 `ValidationException`으로 거부됩니다. ECS task ID(32자리 hex), task ARN, Lambda 이름·ARN이 여기에 걸립니다.
2. **등록 검증**: 형식이 맞아도 SSM에 등록되지 않은 노드면 `InvalidInstanceId`입니다.

대상별로 managed node가 될 수 없는 이유는 다음과 같습니다.

| 대상 | managed node가 아닌 이유 | 대신 쓸 도구 |
| --- | --- | --- |
| ECS Fargate task | 호스트를 사용자가 볼 수 없음. ECS Exec가 띄우는 SSM Agent는 Session Manager 채널(`ecs:<cluster>_<task-id>_<runtime-id>` target)용이고 노드 등록을 하지 않음 | Inspector(ECR 이미지 스캔), Config(`AWS::ECS::TaskDefinition`), 이미지 SBOM |
| ECS on EC2 컨테이너 | 컨테이너는 노드가 아님. 호스트 Agent는 호스트 OS 패키지만 수집 | 호스트 ID에 `Custom:Container` 타입으로 `docker ps` 결과를 기록, Inspector |
| Lambda 함수 | 실행 환경이 요청 단위로 생기고 사라지며, SSM Agent를 둘 상주 OS가 없음 | Config(`AWS::Lambda::Function`), Inspector Lambda 스캔, 함수 태그 |

ECS on EC2와 EKS 노드는 **호스트까지만** Inventory 대상입니다. 컨테이너 정보가 꼭 Inventory에 있어야 하면 호스트에서 `docker ps`나 `crictl ps` 결과를 custom JSON으로 남기는 방식을 씁니다. 다만 컨테이너는 호스트보다 자주 바뀌므로 30분 주기 수집과 맞지 않는 경우가 많습니다.

## 컴포넌트 역할

| 컴포넌트 | 역할 |
| --- | --- |
| `probe_targets.py` | 대상별 ID로 PutInventory를 호출하고 오류 코드만 출력 |
| SSM API | 형식 검증 → 등록 검증 순으로 거부 |

## 흐름

```mermaid
flowchart TD
  req["PutInventory(InstanceId)"] --> fmt{"i- 또는 mi- 형식?"}
  fmt -->|"아니오: ECS task, Lambda"| ve["ValidationException"]
  fmt -->|"예"| reg{"SSM에 등록된 노드?"}
  reg -->|"아니오"| iid["InvalidInstanceId"]
  reg -->|"예: EC2, 하이브리드"| ok["기록"]
```

## 실습

### 1. 대상별 PutInventory 호출

ECS task와 Lambda는 만들지 않습니다. 형식 검증에서 먼저 거부되므로 실제 리소스가 없어도 결과가 같습니다.

```bash
cd aws/ssm/inventory
export AWS_REGION=ap-northeast-2
uv run scripts/probe_targets.py "$(terraform -chdir=terraform output -raw instance_id)"
```

예상 출력(미검증):

```text
EC2 managed node             OK
ECS task ID                  ValidationException
ECS task ARN                 ValidationException
ECS Exec target              ValidationException
Lambda name                  ValidationException
Lambda ARN                   ValidationException
형식만 맞는 없는 EC2 ID      InvalidInstanceId
```

- EC2 호출이 만든 `Custom:Probe` 타입은 스크립트가 끝나며 `DeleteSchema`로 지움

### 2. 오류 코드 해석

- `ValidationException`: 서버가 ID 형식에서 거부. 리소스 존재 여부와 무관
- `InvalidInstanceId`: 형식은 맞지만 SSM에 등록된 노드가 아님. 실제 EC2라도 SSM Agent가 Online이 아니면 같은 오류

## 부록. 실무에서 얻는 것

- "모든 워크로드의 소프트웨어 목록"을 Inventory 하나로 만들 수 없습니다. 서버형(EC2, 온프레미스)은 Inventory, 컨테이너 이미지와 Lambda는 Inspector와 Config로 나누고, 질의 단계(Athena 등)에서 합치는 구성이 현실적입니다.
- Fargate task를 sidecar + 하이브리드 활성화로 `mi-` 노드로 만드는 방법은 동작하지만, task 교체마다 노드가 늘어나고 등록 해제를 직접 관리해야 합니다. FIS처럼 짧은 실험용이 아니면 inventory 목적에는 맞지 않습니다.

## 참고 문서

1. [PutInventory API Reference](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_PutInventory.html)
2. [Monitor Amazon ECS containers with ECS Exec](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html)
3. [AWS FIS aws:ecs:task actions](https://docs.aws.amazon.com/fis/latest/userguide/ecs-task-actions.html)
4. [Supported machine types for managed nodes](https://docs.aws.amazon.com/systems-manager/latest/userguide/operating-systems-and-machine-types.html)
