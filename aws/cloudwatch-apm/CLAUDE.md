# CloudWatch Application Signals(APM) Hands-on

## Overview

AWS CloudWatch Application Signals(APM)를 EC2 환경에서 실습하는 프로젝트.
Python Flask와 Spring Boot 애플리케이션에 코드 변경 없이 APM을 적용하는 방법을 다룬다.

## Architecture

- EC2 (Amazon Linux 2023, ARM64, t4g.small)
- CloudWatch Agent (Application Signals 수신)
- ADOT Python auto-instrumentation (Flask)
- ADOT Java agent (Spring Boot)
- CloudWatch Application Signals (메트릭, 트레이스 시각화)

## Directory Structure

```
cloudwatch-apm/
├── README.md                  # 핸즈온 가이드 (akbun style)
├── CLAUDE.md                  # 프로젝트 컨텍스트
├── python-app/                # Python Flask 샘플 애플리케이션
├── spring-boot-app/           # Spring Boot 샘플 애플리케이션
├── cloudwatch-agent/          # CloudWatch Agent 설정 파일
├── scripts/                   # 설치/실행 스크립트
└── terraform/                 # 인프라 코드 (EC2, IAM, SG)
```

## Terraform Requirements

- Region: ap-northeast-2
- Instance type: t4g.small (ARM Graviton)
- EBS: gp3, encrypted, 30GB
- Default VPC 사용
- terraform >= 1.0, aws provider >= 5.0
