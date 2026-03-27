# aws login — Access Key 없이 AWS CLI 인증하기

## 개요

2025년 11월에 공개된 `aws login` 명령어를 사용하여 Access Key 없이 브라우저 기반 OAuth2 인증으로 AWS CLI를 사용하는 핸즈온입니다.

지금까지 IAM User가 CLI를 사용하려면 Access Key(장기 자격증명)를 발급받아야 했습니다. `aws login`은 브라우저 로그인으로 임시 자격증명을 자동 발급받아 이 문제를 해결합니다.

## 문서 목차

| 문서 | 설명 |
|------|------|
| [concepts.md](./docs/concepts.md) | aws login 개념, 원리, 필수 조건, 기존 방식 비교 |
| [hands-on.md](./docs/hands-on.md) | Terraform으로 IAM User 생성부터 aws login 실행까지 실습 가이드 |

## 디렉터리 구조

```
aws/aws-login/
├── docs/
│   ├── concepts.md      # 개념 문서
│   └── hands-on.md      # 핸즈온 가이드
└── terraform/            # IAM User + aws login 권한 구성
    ├── terraform.tf
    ├── providers.tf
    ├── variables.tf
    ├── iam.tf
    ├── outputs.tf
    └── terraform.tfvars.example
```
