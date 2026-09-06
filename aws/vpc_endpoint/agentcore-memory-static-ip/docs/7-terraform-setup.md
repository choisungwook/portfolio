# Terraform 관리 인증 준비

## Up

- 적용 범위: S01 root와 S07 root, 독립 Roles Anywhere 실습 1개 root.
- Terraform provider에는 `assume_role`·`profile` 설정 없음. 아래 A·B 중 1개를 선택해 관리용 터미널에서 인증.
- 이 실습에서는 A의 `AWS_PROFILE=admin`을 관리 명령 전체(Terraform·CLI·조회·destroy)에 사용해요. `default` 프로파일을 직접 쓰면 로그인 세션이 짧게 만료되는 것을 2026-09-06에 겪었어요.
- 로그인용 IAM 사용자와 배포 Role은 미리 준비. Terraform이 생성하는 실험용 사용자·Role과 구분.
- 기존 배포를 이어서 관리할 때는 원래 계정의 배포 Role과 기존 state 사용.
- AWS CLI 2.32.0 이상과 IAM 사용자의 `SignInLocalDevelopmentAccess` 권한 필요. [AWS login 준비](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html)

| 옵션 | Terraform의 시작 자격증명 | Role 갱신 | 사용 조건 |
| --- | --- | --- | --- |
| A: credential_process 권장 | AWS_PROFILE=admin | 원본 로그인 인증이 유효하면 자동 갱신 | default → base → admin 프로파일 설정 |
| B: STS 임시 키 복사 | AWS_ACCESS_KEY_ID 등 환경변수 | 자동 갱신 없음. STS 재호출 필요 | default 로그인과 jq |

### IAM 사용자와 Role 권한

- 예제의 12자리 계정 ID·사용자·Role 이름은 사용 중인 값으로 교체.
- IAM 사용자에 배포 Role의 `sts:AssumeRole` 권한 부여.
- 배포 Role의 trust policy에서 로그인할 IAM 사용자 허용.
- 배포 Role에는 각 시나리오 setup에 나온 리소스 생성·조회·삭제 권한 부여.

IAM 사용자에 연결할 정책 예시예요.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::123456789012:role/administrator"
  }]
}
```

배포 Role의 trust policy에서 시작 IAM 사용자를 허용해요.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::123456789012:user/terraform"},
    "Action": "sts:AssumeRole"
  }]
}
```

- trust policy는 Role을 받을 주체 지정. 리소스 관리 권한은 배포 Role의 별도 권한 정책으로 부여.
- SCP·permission boundary·명시적 Deny도 적용. MFA·External ID 조건이 있으면 해당 프로파일 또는 STS 명령에 추가 설정 필요.

### 환경변수와 사전 확인

- A·B를 같은 터미널에서 섞지 않고 선택한 옵션의 초기화부터 실행.
- 아래 명령은 Bash·Zsh 기준. 인증 확인이 실패하면 Terraform 실행 전에 로그인·Role 권한 확인.
- `~/.aws/credentials`의 같은 이름 프로파일에 다른 키가 남아 있으면 로그인 자격증명보다 먼저 선택될 수 있으므로 확인.

### 옵션 A: credential_process로 자동 갱신

`~/.aws/config`에 로그인용 `default`, CLI 자격증명을 전달하는 `base`, 배포용 `admin`을 설정해요. 기존의 다른 프로파일은 유지해요.

```ini
[default]
region = ap-northeast-2
output = json
login_session = arn:aws:iam::123456789012:user/terraform

[profile base]
region = ap-northeast-2
credential_process = aws configure export-credentials --profile default --format process

[profile admin]
region = ap-northeast-2
role_arn = arn:aws:iam::123456789012:role/administrator
source_profile = base
```

- `default`: 로그인과 캐시 갱신을 AWS CLI가 처리. ARN만 적으면 인증이 완료되지 않으므로 로그인 명령 실행 필요.
- `base`: CLI가 반환한 Version·키·SessionToken·Expiration JSON을 SDK에 전달.
- `admin`: `base` 자격증명으로 STS AssumeRole 호출. Terraform이 받은 Role 자격증명으로 리소스 관리.
- 내부 명령의 `--profile default`를 유지해야 바깥의 `AWS_PROFILE=admin`과 구분 가능. [AWS의 login → credential_process 예제](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html)
- 실행 환경의 PATH에서 `aws`를 찾을 수 있어야 함. 찾지 못하면 `credential_process`의 `aws`를 실행 파일의 절대 경로로 지정.

관리용 터미널에서 이전 키를 지우고 로그인한 뒤 `admin`을 선택해요.

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
unset AWS_PROFILE AWS_DEFAULT_PROFILE
export AWS_REGION=ap-northeast-2
export AWS_STS_REGIONAL_ENDPOINTS=regional
aws login --profile default
export AWS_PROFILE=admin
aws sts get-caller-identity --query Arn --output text
```

- 예상 출력: `arn:aws:sts::123456789012:assumed-role/administrator/...`.
- `aws login --profile default`는 프로파일 환경변수가 없는 상태의 `aws login`과 같은 대상.
- `credential_process`의 Expiration에 따라 SDK가 CLI를 다시 실행하고, CLI가 필요한 로그인 자격증명 갱신을 처리. [프로세스 자격증명 갱신](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sourcing-external.html)
- `admin` Role 세션은 별도 `duration_seconds` 설정이 없으면 기본 3600초. 원본 인증이 유효하면 다시 발급 가능. [Role 세션 설정](https://docs.aws.amazon.com/sdkref/latest/guide/feature-assume-role-credentials.html)
- CLI가 로그인 처리를 맡으므로 관리용 Boto3에서 `login_session`을 직접 읽기 위한 CRT 추가 설치 불필요.

#### 12시간의 의미

- AWS가 설명하는 자동 갱신 범위는 로그인한 주체의 세션 시간 이내이며 최대 12시간. 항상 12시간 동안 성공한다는 보장은 아님.
- 12시간은 원본 로그인 세션의 갱신 한도. 개별 Role 세션 수명과 구분.
- 전체 세션이 만료·폐기되거나 OAuth 갱신이 거절되면 `aws login --profile default` 재실행 필요. [AWS 로그인 세션 수명](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html)
- 이미 발급된 Role 키는 자체 Expiration까지 사용할 수 있지만, 원본 인증 없이 다음 Role 갱신은 불가. Terraform 실행 시간이 정확히 12시간으로 제한되는 것은 아님.

### 옵션 B: STS 자격증명을 환경변수로 복사

- `~/.aws/config`는 A 예제의 `[default]` 로그인 설정만 필요. `base`·`admin`은 B에서 사용하지 않음.
- STS가 반환한 키를 현재 셸에 복사. Terraform은 원본 로그인이나 STS 재발급 명령을 알지 못하므로 자동 갱신 불가.
- 아래 예제는 3600초 요청. 실제 만료 시각은 STS 응답의 Expiration으로 확인.

이전 프로파일과 키를 지우고 `default`로 로그인해요. Role ARN은 해당 계정의 배포 Role로 바꿔요.

```bash
unset AWS_PROFILE AWS_DEFAULT_PROFILE
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
export AWS_REGION=ap-northeast-2
export AWS_STS_REGIONAL_ENDPOINTS=regional
export TERRAFORM_ROLE_ARN='arn:aws:iam::123456789012:role/administrator'
aws login --profile default
```

STS 응답에서 키를 읽어 현재 셸에 설정해요. 아래 함수를 같은 터미널에 정의하면 Role 키를 다시 받을 때 재사용할 수 있어요.

```bash
assume_terraform_role() {
  local credentials access_key secret_key session_token
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN

  credentials="$(aws sts assume-role \
    --role-arn "$TERRAFORM_ROLE_ARN" \
    --role-session-name terraform \
    --duration-seconds 3600 \
    --profile default \
    --region ap-northeast-2 \
    --query Credentials --output json)" || return
  access_key="$(printf '%s' "$credentials" | jq -er '.AccessKeyId')" || return
  secret_key="$(printf '%s' "$credentials" | jq -er '.SecretAccessKey')" || return
  session_token="$(printf '%s' "$credentials" | jq -er '.SessionToken')" || return

  export AWS_ACCESS_KEY_ID="$access_key"
  export AWS_SECRET_ACCESS_KEY="$secret_key"
  export AWS_SESSION_TOKEN="$session_token"
  printf '%s' "$credentials" | jq -r '"Role 만료: " + .Expiration'
}

assume_terraform_role &&
  aws sts get-caller-identity --query Arn --output text
```

- 예상 ARN: `arn:aws:sts::123456789012:assumed-role/administrator/terraform`.
- `TERRAFORM_ROLE_ARN`은 위 CLI 명령용 환경변수. Terraform provider 입력 변수는 아님.
- 키 자체는 출력하지 않고 만료 시각만 표시. `set -x`를 사용하거나 STS 응답을 로그에 저장하지 않음.
- Role이 만료되면 `assume_terraform_role` 재실행. 원본 로그인이 유효하면 `aws login`은 생략 가능.
- `default` 로그인도 만료됐다면 `aws login --profile default` 후 함수 재실행.
- 실행 중인 Terraform은 부모 셸에서 바꾼 환경변수를 다시 읽지 못함. 만료로 apply가 실패했다면 새 키를 받은 뒤 같은 state에서 plan·apply 재실행.
- 세션 시간을 늘릴 때는 Role의 MaxSessionDuration과 STS 제한 확인. Role chaining은 최대 1시간. [STS AssumeRole 세션 제한](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)

### Terraform init·plan·apply

- A는 `AWS_PROFILE=admin`, B는 위에서 적재한 환경변수 키를 유지.
- 실행할 시나리오의 setup 문서에서 나머지 `TF_VAR_*` 입력값 설정.
- 이전 설정의 `TF_VAR_assume_role_arn` export와 tfvars의 `assume_role_arn` 항목 제거.

S01 root에서 Terraform을 실행해요.

```bash
terraform -chdir=terraform init
terraform -chdir=terraform plan
terraform -chdir=terraform apply
```

- 이미 `terraform/` 디렉터리에 있다면 `-chdir=terraform`을 생략하고 `terraform init`, `terraform plan`, `terraform apply` 실행.
- S07은 `-chdir=terraform/labs/s07`로 변경.
- `init`은 provider 설치·초기화 단계. AWS 조회와 배포 권한은 `plan`에서 확인.
- 배열·객체 입력은 작은따옴표로 감싼 JSON 문자열 사용. 예: `export TF_VAR_subnets='{"ap-northeast-2a":"subnet-..."}'`.
- `terraform.tfvars`·`*.auto.tfvars` 값은 환경변수보다 우선. 환경변수로 전환할 값은 해당 파일에서 제거하거나 파일을 Git에서 제외된 `runtime/`에 백업.
- 백업 파일은 시나리오별로 구분하고 기존 파일을 덮어쓰지 않음. Terraform state는 이동·삭제하지 않음.
- 입력값을 변경했다면 저장된 plan을 재사용하지 않고 새 plan 확인.

### CLI·Python 관리 명령

- endpoint 서비스 조회·target health·CRL 관리도 A·B에서 선택한 인증을 그대로 사용.
- 관리 명령의 `--profile admin`이나 `AWS_PROFILE=admin` 접두사 생략. 특히 B에서는 명시적 CLI 프로파일이 복사한 키 대신 프로파일 인증을 선택할 수 있음.
- 관리용 터미널의 `aws sts get-caller-identity --query Arn --output text`로 대상 계정·Role 확인.
- 클라이언트 실험은 별도 터미널에서 시작 자격증명 사용.
- 클라이언트는 AWS_PROFILE로 시작. `trusted_principal_arn`과 출력 JSON의 클라이언트 `role_arn`은 배포 Role과 별개. [S01 프로파일 준비](2-setup.md#클라이언트-프로파일과-시작-주체) 참고.

### 인증 실패 후 apply 재실행

- A의 갱신도 원본 인증·trust·STS 연결에 문제가 생기면 실패.
- apply 실패 시 완료된 리소스는 자동 롤백되지 않음. 선택한 옵션으로 인증 복구 후 같은 state에서 새 plan 확인 후 apply.
- 생성 도중 실패한 리소스는 교체가 계획될 수 있음. AWS에는 있는데 state에 없는 리소스는 존재 여부 확인 후 import 검토.
- 로컬 state 사용. S3 backend를 추가하면 backend의 인증 설정도 별도 확인.

## Down

- 각 시나리오의 destroy가 끝날 때까지 선택한 관리 인증과 해당 `TF_VAR_*` 값 유지.
- 클라이언트 키를 적재한 터미널과 관리용 터미널 구분.
- 미리 준비한 로그인용 IAM 사용자·배포 Role은 destroy 대상에서 제외.
- S01에서 생성한 실험용 사용자·키는 해당 Terraform의 destroy에 포함.

리소스 정리가 끝나면 관리용 터미널의 인증 환경변수를 지워요.

```bash
unset AWS_PROFILE AWS_DEFAULT_PROFILE TERRAFORM_ROLE_ARN
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
```

## 근거

- [AWS provider의 공유 프로파일 인증](https://registry.terraform.io/providers/hashicorp/aws/latest/docs#shared-configuration-and-credentials-files)
- [CLI export-credentials의 process 형식](https://docs.aws.amazon.com/cli/latest/reference/configure/export-credentials.html)
- [Terraform 입력 변수 우선순위](https://developer.hashicorp.com/terraform/language/values/variables#variable-definition-precedence)
- [Terraform apply 오류 처리](https://developer.hashicorp.com/terraform/tutorials/cli/apply#errors-during-apply)
