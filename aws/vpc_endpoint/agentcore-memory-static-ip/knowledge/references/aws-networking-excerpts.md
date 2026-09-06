---
type: Reference
title: AWS STS·Memory·NLB 공식 문서 발췌
description: 고정 IP 실험의 설계 제약을 재확인하는 짧은 원문 발췌와 해석.
timestamp: 2026-09-05T00:00:00Z
---

## STS endpoint

- 출처: [STS endpoints](https://docs.aws.amazon.com/general/latest/gr/sts.html)
- 서울 endpoint 원문: `sts.ap-northeast-2.amazonaws.com`.
- 확인: STS는 global endpoint 외에 리전별 endpoint도 제공.

## AgentCore 리전

- 출처: [AgentCore Regions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html)
- 표의 `AgentCore Memory` 행과 `Asia Pacific (Seoul)` 열: `✓ Yes`.
- 확인: 서울 Memory 지원. 실제 계정의 endpoint 서비스/AZ는 EC2 API로 추가 확인.

## AgentCore PrivateLink

- 출처: [AgentCore PrivateLink](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/vpc-interface-endpoints.html)
- 지원표 발췌: `Memory | Supported | Supported`.
- data plane 서비스 이름: `com.amazonaws.region.bedrock-agentcore`.
- 확인: Memory 데이터 API용 interface endpoint 지원.

## NLB TLS 통과

- 출처: [NLB listeners](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-listeners.html)
- 원문: “With a TCP listener, the load balancer passes encrypted traffic through to the targets without decrypting it.”
- 확인: TLS 종료용 인증서가 없는 TCP listener 사용.

## PrivateLink ENI 대상

- 출처: [NLB target attributes](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/edit-target-group-attributes.html)
- 원문 발췌: “Client IP preservation is not supported when a target group contains AWS PrivateLink network interfaces”.
- 확인: endpoint ENI를 대상으로 삼을 때 source IP preservation 비활성화.

## Terraform Memory

- 출처: [Terraform Memory resource](https://raw.githubusercontent.com/hashicorp/terraform-provider-aws/main/website/docs/r/bedrockagentcore_memory.html.markdown)
- 발췌: `event_expiry_duration`, `7 to 365`.
- 확인: 최소 이벤트 만료 7일. 사용자 지정 모델 처리 전략이 없는 단기 Memory는 실행 Role 인자를 요구하지 않음.
