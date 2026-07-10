# RBAC 전환과 IAM 전용

TL;DR: AUTH token 클러스터에 `default` user(password=token)와 IAM 인증 user를 담은 user group을 붙여 RBAC로 넘어간다. auth 컨테이너는 `default` user로 계속 붙는 동안 iam 컨테이너로 트래픽을 옮기고, 마지막에 `default` user를 빼 IAM 전용으로 만든다.

[4-auth-token.md](./4-auth-token.md)까지 마치면 `auth_required` 상태에서 8081 auth 컨테이너가 돌고 있다. 아래 `terraform apply` 대신 AWS 콘솔·CLI로 클러스터를 바꾸려면 [6-console-runbook.md](./6-console-runbook.md)를 본다. AUTH token 클러스터에 IAM user group을 바로 붙이면 기존 연결이 끊기므로, `default` user를 다리로 쓴다([2-concepts.md](./2-concepts.md) 참고).

| 단계 | migration_phase | ElastiCache 상태 | 트래픽 컨테이너 | 다음 단계 조건 |
| --- | --- | --- | --- | --- |
| RBAC 호환 | `rbac_overlap` | user group: default(password=token) + iam | 8081 auth | 8081 gate 정상, 8082 검증 |
| IAM 전용 | `iam_required` | user group: iam only | 8082 iam | 8082 gate 정상, AUTH 거부 |

## 1. RBAC로 전환

8081 gate를 유지한 채 user group을 붙인다. `default` user의 password를 기존 token과 같게 만들어(Terraform이 처리) `AUTH <token>` 연결을 그대로 받는다. token 변수는 계속 필요하다.

```bash
export TF_VAR_elasticache_auth_token='<same token>'
terraform -chdir=terraform apply -var migration_phase=rbac_overlap
```

이 변경은 클러스터의 auth token을 지우고(`DELETE`) user group을 붙인다. 8081 gate가 계속 돌면 auth 컨테이너가 RBAC 전환의 영향을 받지 않았다. gate가 끝나면 in-place 전환을 멈추고 이 문서 끝의 blue-green으로 돌아선다.

## 2. iam 컨테이너 배포

EC2 세션에서 iam 컨테이너를 8082에 띄운다. EC2에는 Terraform이 없으므로 아래 값은 로컬 `terraform output`에서 확인해 붙여 넣는다. IAM token은 EC2 instance role로 서명하므로 password 대신 서명·연결 값만 준다. `ELASTICACHE_IAM_USER`는 IAM 인증 모드로 만든 ElastiCache user 이름이지 AWS IAM user가 아니고, `ELASTICACHE_CACHE_NAME`은 token 서명 host로 쓰는 replication group id다.

```bash
export ELASTICACHE_ENDPOINT="<terraform output elasticache_primary_endpoint>"
export CACHE_NAME="<terraform output elasticache_replication_group_id>"
export ELASTICACHE_USER="<terraform output elasticache_iam_user>"
export CACHE_REGION="<terraform output aws_region>"
sudo docker run -d --name iam -p 8082:8080 \
  -e ELASTICACHE_ENDPOINT="$ELASTICACHE_ENDPOINT" \
  -e ELASTICACHE_CACHE_NAME="$CACHE_NAME" \
  -e ELASTICACHE_IAM_USER="$ELASTICACHE_USER" \
  -e AWS_REGION="$CACHE_REGION" \
  choisunguk/elasticache-auth-client:iam-1.0.0
```

8081과 8082가 같은 cache 값을 읽는지 확인한다.

```bash
hurl --variable server_port=8081 ~/hurl/cache-read.hurl
hurl --retry 3 --retry-interval 1s --variable server_port=8082 ~/hurl/cache-read.hurl
```

성공하면 별도 세션에서 `server_port=8082` gate를 시작한다. 8082 gate가 정상인 상태에서 8081 gate를 `Ctrl-C`로 끝내고 컨테이너를 종료한다.

```bash
sudo docker rm -f auth
```

## 3. IAM 전용으로 전환

8081 종료와 8082 gate 정상을 확인한 뒤 user group에서 `default` user를 뺀다. 이 순간 `default` user로 남아 있던 연결이 종료되므로, 앞 단계에서 auth 컨테이너를 반드시 먼저 내려야 한다. `default` user 리소스는 group에서만 빠지고 config에는 남으므로 token 변수가 계속 필요하다. 새 세션이면 같은 token을 다시 export한다.

```bash
export TF_VAR_elasticache_auth_token='<same token>'
terraform -chdir=terraform apply -var migration_phase=iam_required
hurl --variable server_port=8082 ~/hurl/cache-read.hurl
```

8082 gate가 계속 돌고 마지막 조회가 성공하면 IAM 컨테이너의 오류는 0건이다.

AUTH token이 막혔는지 검증 컨테이너로 확인한다. 8084는 트래픽을 받지 않는다.

```bash
export ELASTICACHE_ENDPOINT="<terraform output elasticache_primary_endpoint>"
export AUTH_TOKEN='<same token>'
sudo docker run -d --name reject-auth -p 8084:8080 \
  -e ELASTICACHE_ENDPOINT="$ELASTICACHE_ENDPOINT" \
  -e ELASTICACHE_AUTH_TOKEN="$AUTH_TOKEN" \
  choisunguk/elasticache-auth-client:auth-1.0.0
hurl --retry 3 --retry-interval 1s --variable server_port=8084 ~/hurl/cache-rejected.hurl
sudo docker rm -f reject-auth
```

Hurl이 성공하고 8084 로그에 인증 오류가 보이면 `default` user가 제거됐다.

## 성공 조건

- `rbac_overlap` 적용 중 8081 gate가 끝나지 않는다.
- iam 배포 뒤 8081과 8082가 같은 cache 값을 읽는다.
- 8082 gate를 시작한 뒤 8081 gate와 컨테이너를 종료한다.
- `iam_required` 적용 중 8082 gate가 끝나지 않는다.
- 전환 뒤 8082는 성공하고 AUTH token을 쓰는 8084는 거부된다.

운영에서는 12시간 뒤 재연결과 CloudWatch의 `AuthenticationFailures`, `IamAuthenticationExpirations`도 확인한다. 실습을 마치면 `terraform -chdir=terraform destroy`로 정리한다.

## 무중단이 깨지면: 새 클러스터로 blue-green

`rbac_overlap` 적용 중 8081 gate가 끝나면, 같은 클러스터를 건드리는 in-place 전환이 현재 트래픽을 끊었다. 이때는 기존 클러스터를 그대로 두고 새 클러스터로 옮긴다.

1. `user_group_ids`를 지정해 처음부터 RBAC인 새 replication group을 만든다.
2. iam 컨테이너를 새 endpoint로 띄우고 gate가 정상인지 확인한다.
3. 앱 설정 또는 DNS로 트래픽을 새 endpoint로 cutover한다. cache는 재적재되거나 필요 시 미리 채운다.
4. 기존 클러스터를 폐기한다.

endpoint가 바뀌고 두 클러스터를 잠시 함께 운영하는 비용이 들지만, 기존 클러스터의 연결을 건드리지 않아 전환 순간의 오류 위험이 없다.
