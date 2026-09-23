# AWS 실습 환경

계정 3개에 LiteLLM과 방안별 리소스를 terraform 한 번으로 만든다. 방안은 `terraform.tfvars`의 스위치로 켜고 끈다.

## 만들어지는 것

| 계정 | 리소스 | 조건 |
|---|---|---|
| dev, prod | ECS cluster, LiteLLM service(dev 1, prod 2 replica), Postgres, 수집기(ADOT), 부하 생성기, ALB, Cloud Map | 항상 |
| dev, prod | CloudWatch 대시보드 `litellm-dev`, `litellm-prod` | 항상(방안 1) |
| 모니터링 | OAM sink, 대시보드 `litellm-all-accounts` / dev·prod OAM link | `enable_oam` |
| 모니터링 | VictoriaMetrics, Grafana, EFS, NLB, PrivateLink 서비스 / dev·prod interface endpoint | `enable_selfhosted` |
| 모니터링 | AMP workspace, remote write role | `enable_amp` |
| 모니터링 | AMG workspace | `enable_amg` |

- LiteLLM 모델은 `mock_response`라 provider를 부르지 않는다. token과 spend는 가격표대로 쌓인다
- 부하 생성기는 [local/loadgen/loadgen.py](../local/loadgen/loadgen.py)를 그대로 돌린다. team 3개, key 4개, model 3개를 섞고 5%는 없는 model을 불러 실패를 만든다
- ALB와 Grafana는 실습자 공인 IP에서만 열린다

## 준비

- AWS 계정 3개와 각 계정의 관리자 권한 AWS CLI profile
- Terraform 1.11 이상
- `enable_amg`를 켤 때만: 모니터링 계정(또는 조직)에 IAM Identity Center가 켜져 있어야 한다

`~/.aws/config`에 profile 3개를 만든다. 이름은 자유다.

```ini
[profile lab-monitoring]
region = ap-northeast-2

[profile lab-dev]
region = ap-northeast-2

[profile lab-prod]
region = ap-northeast-2
```

tfvars 예시를 복사하고 profile 이름과 켤 방안을 적는다.

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

## up

workspace 루트에서 init과 apply를 한 번에 실행한다.

```bash
terraform -chdir=terraform init && terraform -chdir=terraform apply -auto-approve
```

- LiteLLM task가 healthy가 되기까지 3~5분 걸린다
- 부하 생성기는 기동 직후부터 초당 1건씩 보낸다

접속 정보는 output으로 확인한다.

```bash
terraform -chdir=terraform output
terraform -chdir=terraform output -raw litellm_master_key
```

## down

세 계정의 리소스를 모두 지운다.

```bash
terraform -chdir=terraform destroy -auto-approve
```

## 켜 둔 동안의 비용

| 대상 | 시간당 USD |
|---|---:|
| 기본(dev·prod의 Fargate task 9개, ALB 2개, 공인 IPv4 17개) | 약 0.34 |
| `enable_selfhosted` 추가 | 약 0.20 |
| `enable_amp` 추가 | 사용량 과금, 실습 규모면 0.01 미만 |
| `enable_amg` 추가 | 로그인한 editor 1명당 월 9 USD. 한 번만 로그인해도 그 달 license가 청구된다 |

`enable_oam`은 추가 비용이 없다.
