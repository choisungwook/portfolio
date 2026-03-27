# aws login 핸즈온

## 목차

- [사전 준비](#사전-준비)
- [Step 1: Terraform으로 IAM User 생성](#step-1-terraform으로-iam-user-생성)
- [Step 2: 콘솔 로그인 비밀번호 설정](#step-2-콘솔-로그인-비밀번호-설정)
- [Step 3: aws login 실행](#step-3-aws-login-실행)
- [Step 4: 임시 자격증명 확인](#step-4-임시-자격증명-확인)
- [Step 5: 정리](#step-5-정리)
- [참고자료](#참고자료)

## 사전 준비

- AWS 계정 (Root User 또는 AdministratorAccess 권한이 있는 IAM User)
- Terraform >= 1.11
- AWS CLI >= 2.32.0

AWS CLI 버전을 확인합니다.

```bash
aws --version
```

2.32.0 미만이면 업데이트가 필요합니다.

```bash
# Linux (x86_64)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install --update

# macOS
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
```

## Step 1: Terraform으로 IAM User 생성

Terraform으로 `aws login`에 필요한 IAM User와 권한을 생성합니다.

`terraform/` 디렉터리로 이동합니다.

```bash
cd terraform
```

`terraform.tfvars` 파일을 생성합니다. `terraform.tfvars.example`을 참고하세요.

```bash
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars`를 수정합니다.

```hcl
project_name = "aws-login-handson"
aws_region   = "ap-northeast-2"
iam_username = "test-developer"
```

Terraform을 실행합니다.

```bash
terraform init
terraform plan
terraform apply
```

apply가 완료되면 output을 확인합니다.

```bash
terraform output
```

출력 예시입니다.

```
iam_user_name = "test-developer"
iam_user_arn  = "arn:aws:iam::123456789012:user/test-developer"
console_login_url = "https://123456789012.signin.aws.amazon.com/console"
```

## Step 2: 콘솔 로그인 비밀번호 설정

`aws login`은 콘솔 로그인을 사용하기 때문에, IAM User에 콘솔 비밀번호가 설정되어 있어야 합니다.

AWS 콘솔 > IAM > Users > `test-developer` > Security credentials > Console sign-in에서 비밀번호를 설정합니다.

또는 CLI로 설정합니다.

```bash
aws iam create-login-profile \
  --user-name test-developer \
  --password 'YourSecurePassword123!' \
  --password-reset-required
```

## Step 3: aws login 실행

이제 Access Key 없이 CLI 인증을 해봅니다.

기존 credentials 파일에 해당 프로필의 Access Key가 없는 상태여야 합니다. 깨끗한 프로필을 사용합니다.

```bash
aws login --profile test-developer
```

실행하면:

1. 리전을 묻는 프롬프트가 나옵니다 (기본 리전이 설정되지 않은 경우)

```
AWS Region [ap-northeast-2]:
```

2. 브라우저가 열리면서 AWS 콘솔 로그인 페이지가 표시됩니다

3. Account ID, IAM User 이름, 비밀번호를 입력하여 로그인합니다

4. 로그인이 완료되면 CLI에 성공 메시지가 표시됩니다

```
Successfully logged in.
```

## Step 4: 임시 자격증명 확인

`aws login`이 성공하면 임시 자격증명이 자동으로 캐시됩니다.

캐시 파일을 확인합니다.

```bash
ls ~/.aws/login/cache/
```

현재 인증 정보를 확인합니다.

```bash
aws sts get-caller-identity --profile test-developer
```

출력 예시입니다.

```json
{
    "UserId": "AIDAEXAMPLE",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/test-developer"
}
```

S3 버킷 목록을 조회하여 실제로 CLI가 동작하는지 확인합니다.

```bash
aws s3 ls --profile test-developer
```

**Access Key를 발급하지 않았는데도 CLI가 정상 동작합니다.** 이것이 `aws login`의 핵심입니다.

### 임시 자격증명의 수명

- AWS CLI가 15분마다 자격증명을 자동 갱신합니다
- 전체 세션은 최대 12시간 유효합니다
- 12시간이 지나면 `aws login`을 다시 실행해야 합니다

### 로그아웃

작업이 끝나면 로그아웃합니다.

```bash
aws logout --profile test-developer
```

캐시된 자격증명이 삭제됩니다.

## Step 5: 정리

실습이 끝나면 Terraform 리소스를 삭제합니다.

```bash
cd terraform
terraform destroy
```

## 참고자료

- https://aws.amazon.com/blogs/security/simplified-developer-access-to-aws-with-aws-login/
- https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html
