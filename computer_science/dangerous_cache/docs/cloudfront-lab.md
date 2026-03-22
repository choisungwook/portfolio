# CloudFront 실습 - Terraform으로 CDN 캐시 취약점 재현

Terraform으로 CloudFront + S3 + ALB + EC2 인프라를 배포하고, 실제 AWS 환경에서 CDN 캐시 취약점을 재현합니다.

## 사전 준비

- [AWS 계정](https://aws.amazon.com/)
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.11
- AWS CLI 설정 완료 (`aws configure`로 Access Key 설정)

아래 명령어로 도구가 정상 설치되었는지 확인합니다.

```bash
terraform --version
aws sts get-caller-identity
```

## 아키텍처

아래는 CloudFront 실습의 전체 아키텍처 구성도입니다.

```text
사용자 → CloudFront → S3 (정적 파일: index.html, style.css, app.js)
                    → ALB → EC2 Graviton (Flask API: /api/login, /api/profile)
```

| 구성 요소 | 역할 |
|-----------|------|
| S3 (Simple Storage Service) | 프론트엔드 정적 파일 호스팅 |
| EC2 (Elastic Compute Cloud) | Flask 백엔드 API 실행 |
| ALB (Application Load Balancer) | 요청을 EC2 서버에 분배 |
| CloudFront | AWS CDN 서비스. 캐시 정책 적용 |

## Terraform 배포

### 코드 다운로드

Git 저장소를 클론하고 프로젝트 디렉터리로 이동합니다.

```bash
git clone https://github.com/choisungwook/portfolio.git
cd portfolio/computer_science/dangerous_cache
```

### 인프라 배포

Terraform으로 인프라를 배포합니다.

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

`terraform apply` 실행 시 확인 프롬프트가 나타납니다. `yes`를 입력하여 배포를 시작합니다. 배포에 약 5~10분 소요됩니다.

배포가 완료되면 output에 CloudFront 도메인이 출력됩니다.

```bash
cloudfront_domain_name = "d1234abcdef.cloudfront.net"
```

### EC2 초기화 대기

EC2 user_data(인스턴스가 처음 시작될 때 자동 실행되는 스크립트)로 Flask 앱이 자동 설치됩니다. **배포 후 약 2~3분 정도 기다려주세요.**

아래 명령어로 ALB target group의 health 상태를 확인합니다.

```bash
aws elbv2 describe-target-health \
  --target-group-arn $(terraform output -raw alb_target_group_arn)
```

정상이면 아래와 같이 `"State": "healthy"`가 출력됩니다.

```json
{
  "TargetHealthDescriptions": [
    {
      "Target": {"Id": "i-0abc123..."},
      "TargetHealth": {"State": "healthy"}
    }
  ]
}
```

## 취약점 재현

### Step 1: alice로 로그인

1. CloudFront 도메인(`http://d1234abcdef.cloudfront.net`) 접속
2. alice / password123 입력 후 Login 클릭
3. Alice Kim의 프로필 확인 (이름, 이메일, 잔액 $15,230.00)

이 요청이 CloudFront(CDN)를 통과하면서 `/api/profile` 응답이 캐시에 저장됩니다.

### Step 2: 시크릿 모드에서 확인

1. 새 시크릿 모드 창 열기 (Chrome: Ctrl+Shift+N)
2. 같은 CloudFront 도메인 접속
3. **로그인하지 않고** 개발자 도구(F12) → Console에서 아래 코드를 실행합니다.

아래 코드를 실행하면 CloudFront가 캐시한 응답을 확인할 수 있습니다.

```javascript
fetch("/api/profile").then(r => r.json()).then(console.log)
```

Console에 아래와 같이 Alice의 프로필이 출력됩니다.

```json
{"name": "Alice Kim", "email": "alice@example.com", "balance": "$15,230.00"}
```

**로그인하지 않았는데 Alice의 프로필 정보가 그대로 보입니다!**

### Step 3: 캐시 HIT 확인

개발자 도구(F12) → Network 탭에서 `/api/profile` 요청의 응답 헤더를 확인합니다.

```text
x-cache: Hit from cloudfront
```

`Hit from cloudfront`가 보이면 CloudFront가 origin에 요청하지 않고 캐시된 응답을 그대로 전달한 것입니다.

## 리소스 삭제

**실습이 끝나면 반드시 리소스를 삭제하세요.** `yes`를 입력하여 삭제를 확인합니다.

```bash
cd terraform
terraform destroy
```

삭제에 5~10분 소요될 수 있습니다. 완료되면 아래와 같은 메시지가 출력됩니다.

```text
Destroy complete! Resources: X destroyed.
```

삭제에 실패하면 `terraform destroy`를 다시 실행하세요.
