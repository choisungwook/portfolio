# Cloud Custodian으로 FinOps 자동화

비용 리포트가 지출을 줄이지 못하는 이유는 리포트에 "누가, 언제까지"가 없기 때문이다. Cloud Custodian은 그 자리를 태그 하나로 메운다. 이 저장소는 그 원리와, EC2/RDS/EBS 정책을 실제로 돌려 보는 실습이다.

핵심은 삭제 자동화가 아니다. 리포트와 삭제 사이에 있는 **mark-for-op**, 즉 리소스 자신에게 기한을 적어 두는 동작이다. 상태를 리소스가 들고 있으므로 엔진은 상태를 저장하지 않아도 되고, 담당자는 콘솔에서 기한을 보고, 태그를 고치면 기한이 사라진다.

## 학습지

[studysheet-custodian-finops-v1.html](./studysheet-custodian-finops-v1.html)을 브라우저로 열면 원리부터 트레이드오프까지 한 번에 훑을 수 있다. 외부 라이브러리 없이 파일 하나로 동작한다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/setup.md](./docs/setup.md) | 두 실습 환경의 up과 down |
| [docs/1-problem.md](./docs/1-problem.md) | 비용 대시보드가 청구서를 못 줄이는 이유 |
| [docs/2-principle.md](./docs/2-principle.md) | resource/filter/action 파이프라인과 태그 상태 머신 |
| [docs/3-handson-local.md](./docs/3-handson-local.md) | 실습 1. AWS 계정 없이 mock으로 정책 실행 |
| [docs/4-handson-aws.md](./docs/4-handson-aws.md) | 실습 2. 실제 EC2, RDS, EBS |
| [docs/5-cleanup.md](./docs/5-cleanup.md) | 정리와 destroy가 놓치는 것 |

## 정책

| 파일 | 무엇을 찾는가 |
|---|---|
| [policies/1-tag-audit.yml](./policies/1-tag-audit.yml) | action이 없는 조회 전용 정책 |
| [policies/2-tag-enforce.yml](./policies/2-tag-enforce.yml) | mark, 고치면 unmark, 기한 지나면 stop |
| [policies/3-offhours.yml](./policies/3-offhours.yml) | 업무 시간 외 EC2/RDS 정지와 기동 |
| [policies/4-orphans.yml](./policies/4-orphans.yml) | 미사용 EBS, 미할당 EIP, 오래된 RDS 스냅샷 |
| [policies/5-rightsizing.yml](./policies/5-rightsizing.yml) | CloudWatch 지표로 저사용 리소스 탐지 |

## 디렉터리

| 경로 | 설명 |
|---|---|
| `compose.yaml`, `scripts/` | mock AWS(moto) 실습 환경과 시드 스크립트 |
| `terraform/` | 실제 계정 실습용 EC2 2대, 미사용 EBS, RDS, IAM 정책 |
| `policies/` | custodian 정책 |
| `docs/` | 실습 문서 |
