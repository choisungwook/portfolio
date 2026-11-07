# 문제 해결

## 첫 apply 직후 prober에 오류가 몇 분 동안 쌓인다

증상: apply 직후 prober 집계에 `AuthMode=password` 오류와 `unknown` 오류가 나옵니다.

```text
(2003, "Can't connect to MySQL server on '<cluster endpoint>' ...")   04:42:35 ~ 04:45:20
(1045, "Access denied for user 'app_pw'@'<EC2 private IP>' ...")       04:44:38 ~ 04:48:01
timed out (AuthMode=unknown)                                         04:44:03 ~ 04:44:36
```

원인: 생성 순서입니다. Lambda와 EC2가 Aurora writer보다 먼저 준비되고, `app_pw`는 apply 마지막의 `terraform_data.db_init`이 만듭니다. `unknown`은 EC2 앱이 아직 기동 중이라 prober가 응답을 못 받은 경우입니다.

해결: 할 일은 없습니다. `db-init done`이 출력된 뒤로는 오류가 0이 되고, 실습 판정은 그 이후 구간으로 합니다.

## mysql client에서 ERROR 2059가 난다

증상:

```text
ERROR 2059 (HY000): Authentication plugin 'mysql_clear_password' cannot be loaded: plugin not enabled
```

원인: IAM 사용자는 token을 평문 플러그인으로 받습니다. client가 이 플러그인을 허용하지 않으면 token을 보내지 않습니다.

해결: `mysql --enable-cleartext-plugin`을 붙입니다. PyMySQL은 `mysql_clear_password`를 기본으로 처리하므로 TLS만 켜면 됩니다(`app/app.py`).

## EC2 application status check 응답을 jq로 못 읽는다

증상: 공식 문서 예시대로 `.ApplicationStatuses[].ApplicationStatus`를 읽으면 오류가 납니다.

```text
jq: error (at <stdin>:30): Cannot index array with string "ApplicationStatus"
```

원인: AWS CLI 2.36에서 응답은 `ApplicationStatuses.Instances[]` 아래에 있었습니다.

해결: `.ApplicationStatuses.Instances[0].ApplicationStatus`로 읽습니다.

## audit 로그 조회 결과가 비어 있다

증상: 방금 접속했는데 Logs Insights에서 `CONNECT`가 나오지 않습니다.

원인: audit 로그는 CloudWatch에 약 2분 늦게 도착했습니다.

해결: 시작 시각을 넉넉히 잡고 몇 분 뒤 다시 조회합니다. 옛 사용자 접속 0건 판정도 같은 이유로 마지막 전환 몇 분 뒤에 합니다.

## uv run이 엉뚱한 interpreter를 찾는다

증상:

```text
error: No interpreter found at path `3.12.1/envs/jwt`
```

원인: 셸이나 상위 디렉터리의 Python 버전 설정(pyenv 등)이 uv에 전달됐습니다.

해결: `uv run --python 3.12 scripts/inplace_alter_demo.py ...`처럼 버전을 지정합니다.

## terraform destroy가 security group에서 오래 멈춘다

증상: `aws_security_group.prober`와 `aws_security_group.healthcheck`가 몇 분 넘게 `Still destroying`입니다.

원인: 두 security group 모두 AWS가 만든 managed ENI에 붙어 있습니다. 실습에서 `healthcheck`는 14분 38초, `prober`는 21분 15초 뒤에 지워졌습니다. VPC Lambda의 ENI와 application status check의 ENI는 함수나 검사를 지운 뒤 AWS가 비동기로 정리하고, 그동안 security group을 지울 수 없습니다.

해결: 기다립니다. Terraform이 재시도하며 ENI가 사라지면 이어서 지웁니다.

## destroy 뒤에도 Lambda log group이 남는다

증상: `terraform destroy`가 끝났는데 `/aws/lambda/aurora-iam-lab-prober`가 있습니다.

원인: destroy 순간 실행 중이던 prober가 Terraform이 log group을 지운 뒤에도 로그를 썼고, Lambda가 log group을 자동으로 다시 만들었습니다.

해결: `aws logs delete-log-group --log-group-name /aws/lambda/aurora-iam-lab-prober`로 지웁니다.
