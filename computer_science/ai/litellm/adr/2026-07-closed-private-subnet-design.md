---
type: Decision
title: 폐쇄망 트랙은 NAT 없는 private subnet과 VPC endpoint, AL2023 표준 AMI로 구성한다
description: private subnet에 IGW·NAT를 두지 않고 SSM·S3·ECR·bedrock-runtime endpoint로만 운영하며, EC2는 AL2023 arm64 표준 AMI(t4g.medium)를 쓴다.
tags: [aws, vpc, ec2, bedrock, terraform]
timestamp: 2026-07-11T00:00:00Z
---

## 결정

- private subnet에는 Internet Gateway 경로도 NAT gateway도 두지 않는다. 인터넷 통신이 물리적으로 불가능한 상태를 만든다.
- 운영·개발에 필요한 통신은 VPC endpoint로만 해결한다: ssm·ssmmessages·ec2messages(접속), s3 gateway(OS 패키지·이미지 layer), ecr.api·ecr.dkr(컨테이너 이미지), bedrock-runtime(LLM 호출).
- EC2는 AL2023 arm64 표준 AMI에 t4g.medium을 쓴다. Bedrock 전용 AMI는 쓰지 않는다.
- LiteLLM 컨테이너 이미지는 로컬에서 ghcr.io에서 받아 private ECR에 push해 공급한다.

## 이유

- 이 트랙의 목적은 "인터넷이 안 되어야 하는 엔터프라이즈 조건"의 재현이다. NAT를 하나라도 두면 조건이 깨지므로, 불편(패키지 설치·이미지 공급)을 endpoint와 사전 push로 푸는 쪽이 목적에 맞다.
- Bedrock은 API 서비스라 호출하는 쪽 OS에 요구사항이 없어 전용 AMI라는 것이 존재하지 않는다. GPU가 달린 Deep Learning AMI는 로컬 추론용이라 이 실습과 무관하다.
- AL2023을 추천하는 실질적 이유는 dnf 저장소가 리전 내 S3로 서비스된다는 점이다. S3 gateway endpoint만 있으면 폐쇄망에서도 docker 같은 패키지를 설치할 수 있어, 별도 미러나 golden AMI 없이 표준 AMI로 실습이 성립한다.
- SSM Session Manager 접속은 저장소 Terraform 규칙(port 22 미개방)과 일치하고, 폐쇄망에서는 bastion을 둘 public subnet 자체가 없으므로 유일한 현실적 접속 수단이기도 하다.
- Bedrock 호출 자격증명은 EC2 instance role로 공급한다. 장기 API key가 폐쇄망 안에 존재하지 않게 되어, 엔터프라이즈가 gateway에 기대하는 자격증명 관리 단순화를 그대로 보여준다.

## Citations

1. Amazon Bedrock VPC endpoint: <https://docs.aws.amazon.com/bedrock/latest/userguide/usingVPC.html>
2. VPC endpoint로 SSM Session Manager 쓰기: <https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-privatelink.html>
3. ECR interface endpoint: <https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html>
