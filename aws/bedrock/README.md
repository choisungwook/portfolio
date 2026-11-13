# Amazon Bedrock hands-on

Amazon Bedrock 실습의 진입점입니다. 각 하위 디렉터리는 독립적으로 실행합니다.

## 디렉터리

| 디렉터리 | 내용 |
| --- | --- |
| [agentcore-runtime-v2](./agentcore-runtime-v2/) | AgentCore Runtime platform version V1과 V2 비교. snapshot 시작, 상태 복제, V2 전환, 메모리 과금 |
| [guardrails](./guardrails/) | LiteLLM Proxy에 Bedrock Guardrails를 붙여 검사 시점, 스트리밍, 비용 측정과 운영 모니터링, 사용자 문의 대응 |
| [knowledge-base-s3-vectors](./knowledge-base-s3-vectors/) | Bedrock Knowledge Bases와 S3 Vectors로 구성한 RAG |
| [model-inference](./model-inference/) | Playground, Bedrock Runtime, Bedrock Mantle 모델 호출 비교 |
