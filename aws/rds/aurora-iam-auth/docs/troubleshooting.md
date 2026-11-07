# 문제 해결 및 트러블슈팅 가이드

본 문서는 Aurora MySQL IAM DB 인증 핸즈온을 진행하거나 실제 운영 환경에 적용할 때 마주칠 수 있는 대표적인 문제 상황과 기술적 원인, 그리고 해결 방법을 정리한 가이드입니다.

## 배포 직후 Prober에 2003 / 1045 에러가 일시적으로 발생하는 현상

**증상**: 인프라를 처음 배포(`terraform apply`)한 직후 CloudWatch의 Lambda Prober 로그를 확인하면 다음과 같이 `Can't connect to MySQL server` 또는 `Access denied for user 'app_pw'` 에러가 일시적으로 기록됩니다.

배포 직후 Prober 로그에 수집된 에러 로그 예시입니다.

```text
(2003, "Can't connect to MySQL server on '<cluster endpoint>' ...")   04:42:35 ~ 04:45:20
(1045, "Access denied for user 'app_pw'@'<EC2 private IP>' ...")       04:44:38 ~ 04:48:01
timed out (AuthMode=unknown)                                         04:44:03 ~ 04:44:36
```

**원인**: AWS 리소스의 생성 완료 순서 차이로 인해 발생하는 일시적인 현상입니다. VPC 내부의 Lambda Prober와 EC2 웹 애플리케이션 인스턴스는 배포 시작 후 약 2~3분 내에 먼저 가동을 시작하지만, Aurora Serverless v2 클러스터 생성에는 약 7~10분이 소요됩니다. 또한 Aurora가 기동된 후에도 초기화 스크립트(`scripts/db-init.sh`)가 `app_pw` 계정을 생성하기 전까지는 DB 접속이 불가능하며, EC2 앱이 부팅 과정에서 `uv` 패키지를 설치하는 동안에는 `AuthMode=unknown` 타임아웃이 발생합니다.

**해결**: 별도의 수동 조치가 필요하지 않습니다. Terraform 콘솔에 `db-init done: labdb.items, user app_pw` 메시지가 출력되고 배포가 완전히 종료되면 에러가 자동으로 0건으로 안정화됩니다. 핸즈온의 무중단 지표 판정은 이 안정화 시점 이후의 구간을 기준으로 측정합니다.

## MySQL Client 접속 시 ERROR 2059 (mysql_clear_password) 발생 현상

**증상**: 로컬 터미널에서 `mysql` 클라이언트로 IAM 인증 로그인을 시도할 때 다음과 같은 에러가 발생하며 접속이 차단됩니다.

클라이언트 콘솔에 출력되는 플러그인 누락 에러 메시지입니다.

```text
ERROR 2059 (HY000): Authentication plugin 'mysql_clear_password' cannot be loaded: plugin not enabled
```

**원인**: IAM DB 인증을 사용하는 데이터베이스 사용자는 비밀번호 자리에 전달되는 긴 SigV4 서명 토큰을 평문(Cleartext) 플러그인을 통해 수신합니다. 보안상 MySQL 클라이언트는 중간자 공격을 방지하기 위해 사용자가 명시적으로 허용하지 않는 한 패스워드를 평문 플러그인으로 전송하지 않도록 차단합니다.

**해결**: 접속 명령어에 `--enable-cleartext-plugin` 플래그를 추가합니다. 전송 중 패스워드 탈취를 방지하기 위해 TLS 암호화(`--ssl-mode=REQUIRED` 또는 `VERIFY_IDENTITY`)가 반드시 함께 설정되어 있어야 합니다. (Python의 PyMySQL 등 대부분의 최신 드라이버는 내부적으로 해당 플러그인을 자동 지원합니다.)

MySQL 클라이언트에 클리어텍스트 플러그인 활성화 옵션을 추가하여 실행합니다.

```bash
mysql -h $HOST -u app_iam --password="$TOKEN" --enable-cleartext-plugin --ssl-mode=REQUIRED
```

## AWS CLI로 Application Status Check 응답 파싱 시 jq 에러 현상

**증상**: EC2 Application Status Check 상태를 조회하기 위해 공식 문서의 예제 명령어를 실행하면 `jq` 파싱 에러가 발생합니다.

터미널에 출력되는 jq 인덱싱 에러 메시지입니다.

```text
jq: error (at <stdin>:30): Cannot index array with string "ApplicationStatus"
```

**원인**: AWS CLI v2.36 이후 최신 버전에서 `describe-application-status`의 응답 JSON 구조가 기존 공식 가이드의 루트 배열 형태에서 `ApplicationStatuses.Instances[]` 하위 객체로 변경되었습니다.

**해결**: jq 질의 경로를 `.ApplicationStatuses.Instances[0].ApplicationStatus`로 수정하여 접근합니다.

수정된 경로를 적용하여 Application Status Check 상태를 파싱합니다.

```bash
aws ec2 describe-application-status --instance-ids $INSTANCE_ID --output json \
  | jq -r '.ApplicationStatuses.Instances[0].ApplicationStatus.Status'
```

## CloudWatch Logs Insights에서 Audit 로그가 즉시 조회되지 않는 현상

**증상**: 데이터베이스에 성공적으로 로그인하거나 실패를 유도한 직후, CloudWatch Logs Insights에서 `/aws/rds/cluster/aurora-iam-lab/audit` 로그 그룹을 조회해도 방금 발생한 `CONNECT` 이벤트가 검색되지 않습니다.

**원인**: Aurora MySQL의 Advanced Auditing 엔진은 쿼리 성능 저하를 방지하기 위해 감사 로그를 메모리 버퍼에 모았다가 비동기로 CloudWatch Logs에 플러시(Flush)합니다. 이로 인해 실제 접속 발생 시점부터 CloudWatch 로그 스트림에 인덱싱되기까지 약 **1~2분의 전송 지연(Ingestion Latency)**이 발생합니다.

**해결**: 전환 작업 직후 즉시 쿼리하지 않고, 약 2분 정도 대기한 후 검색 시작 시각(`@timestamp`) 범위를 넉넉하게 지정하여 재조회합니다. 핸즈온 4단계의 "구 계정 접속 0건 확인" 역시 마지막 전환 시각으로부터 최소 2~3분이 지난 뒤 검증을 수행합니다.

## uv run 실행 시 잘못된 Python 인터프리터를 참조하는 현상

**증상**: In-Place 전환 데모 스크립트 실행 시 `uv run`이 엉뚱한 가상환경 경로를 탐색하며 실패합니다.

터미널에 출력되는 인터프리터 탐색 실패 에러입니다.

```text
error: No interpreter found at path `3.12.1/envs/jwt`
```

**원인**: 사용자의 셸 환경에 `pyenv`, `conda`, 또는 상위 디렉터리의 `.python-version` 파일이 활성화되어 있어 `uv`가 호스트 시스템의 비호환 인터프리터를 우선 탐색했기 때문입니다.

**해결**: `uv run` 명령어에 `--python 3.12` 또는 `--python 3.13`과 같이 사용할 Python 버전을 명시적으로 지정하여 독립 실행하도록 지시합니다.

Python 버전을 명시하여 스크립트를 기동합니다.

```bash
uv run --python 3.12 scripts/inplace_alter_demo.py ...
```

## Terraform destroy 시 Security Group 삭제 지연 (Still destroying)

**증상**: `terraform destroy` 실행 중 `aws_security_group.prober`와 `aws_security_group.healthcheck` 리소스에서 10~20분 이상 `Still destroying...` 상태가 지속됩니다.

**원인**: 해당 보안 그룹들은 VPC 내부에서 동작하는 AWS 관리형 ENI(Lambda의 VPC ENI 및 Application Status Check 관리형 ENI)에 바인딩되어 있습니다. AWS 서비스는 람다 함수나 상태 검사가 삭제된 후 내부 비동기 워커를 통해 해당 ENI를 디태치(Detach)하고 회수합니다. ENI가 완전히 해제되기 전까지는 보안 그룹을 삭제할 수 없으므로 Terraform이 대기 상태에 머무르게 됩니다.

**해결**: 비정상 동작이 아니므로 명령을 강제 종료하지 말고 기다립니다. Terraform이 주기적으로 삭제를 재시도하며, AWS가 ENI를 회수하는 즉시(약 15~21분 소요) 보안 그룹이 정상 삭제되고 프로세스가 완료됩니다.

## Terraform destroy 완료 후에도 Lambda Log Group이 재생성되는 현상

**증상**: `terraform destroy`가 정상 종료되었음에도 불구하고 AWS 콘솔이나 CLI에서 `/aws/lambda/aurora-iam-lab-prober` CloudWatch 로그 그룹이 여전히 남아있거나 다시 생성되어 있습니다.

**원인**: `terraform destroy`가 실행되는 순간 마지막 주기로 실행 중이던 Lambda Prober 함수(최대 56초간 동작)가 존재할 수 있습니다. Terraform이 로그 그룹을 먼저 삭제한 직후, 백그라운드에서 실행을 마치던 Prober가 마지막 완료 로그를 출력하면서 AWS Lambda 서비스의 기본 동작에 의해 동일한 이름의 로그 그룹이 자동으로 재생성된 경우입니다.

**해결**: Terraform 자원 정리가 끝난 후 AWS CLI 명령어로 잔여 로그 그룹을 수동으로 삭제합니다.

잔여 Lambda Prober 로그 그룹을 삭제합니다.

```bash
aws logs delete-log-group --log-group-name /aws/lambda/aurora-iam-lab-prober
```
