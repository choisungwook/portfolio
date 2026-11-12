# SSM Inventory와 PutInventory

AWS Systems Manager Inventory로 managed node의 소프트웨어 목록을 모으고, `PutInventory` API로 업무 메타데이터를 덧붙이고, S3로 집계합니다. ECS task와 Lambda가 Inventory 대상이 될 수 없는 이유를 API 응답으로 확인합니다.

실습은 아직 실제 AWS에서 실행하지 않았습니다. 문서의 출력은 공식 문서 기준 예상값이며 "미검증"으로 표시했습니다.

## 결론 먼저

- Inventory의 키는 managed node ID(`i-`, `mi-`)입니다. EC2, 온프레미스·타 클라우드 VM, ECS on EC2·EKS의 호스트까지가 대상입니다.
- ECS Fargate task, 컨테이너, Lambda 함수는 managed node가 아니라서 기본 수집도 `PutInventory`도 불가합니다. 이 대상은 AWS Config와 Amazon Inspector가 맡습니다.
- 같은 custom 타입의 `PutInventory`는 행 추가가 아니라 전체 교체입니다.
- Inventory는 최신값을 30일만 보관합니다. 이력과 SQL 질의는 resource data sync로 S3에 내보내서 합니다.

## 순서

| | 문서 |
| --- | --- |
| 준비 | [setup](docs/setup.md) |
| 1 | [기능 지도와 대상별 가능 여부](docs/1-concept.md) |
| 2 | [기본 inventory 수집](docs/2-builtin-inventory.md) |
| 3 | [PutInventory로 custom inventory 기록](docs/3-put-inventory.md) |
| 4 | [ECS·Lambda가 Inventory 대상이 아닌 이유](docs/4-unsupported-targets.md) |
| 5 | [Resource data sync로 S3에 집계](docs/5-resource-data-sync.md) |

## 저장소 구성

| 경로 | 역할 |
| --- | --- |
| `terraform/` | EC2 managed node, inventory association, resource data sync, S3 |
| `scripts/put_inventory.py` | `Custom:AppDeployment` 기록 |
| `scripts/probe_targets.py` | ECS·Lambda 형식 ID로 PutInventory 호출해 거부 확인 |
| `examples/` | custom inventory 입력 JSON |
| `knowledge/` | 설계 결정. 고치기 전에 [index](knowledge/index.md) |
