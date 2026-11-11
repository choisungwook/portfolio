---
type: Topic
title: isolated sandbox는 노드를 지키지만 SA 토큰과 Container Insights 메트릭은 그대로가 아니다
description: Gemma 2B 코드 실행 실습에서 확인한 sandbox가 막는 것, 못 막는 것, 관측에서 빠지는 것
tags: [nitro-sandboxes, eks, ai-agent, observability, rbac]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-11T01:10:00Z }
---

# isolated sandbox는 노드를 지키지만 SA 토큰과 Container Insights 메트릭은 그대로가 아니다

2026-11-11, EKS 1.37 Auto Mode(us-west-2), `c8a.large`에서 같은 LLM 코드를 runc와 `isolated-sandbox` executor에서 실행한 결과다. 상세는 [6-ai-agent-code-sandbox.md](../../docs/6-ai-agent-code-sandbox.md).

- 막는 것: `hostPID`, hostPath(`/`)를 줘도 sandbox는 노드 프로세스와 노드 파일에 닿지 않는다. hostPath의 `/`는 sandbox guest 루트로 바뀐다.
- 못 막는 것: service account 토큰이 sandbox 안에도 마운트되고, 그 토큰으로 API server 호출이 200이었다. 외부 인터넷도 열려 있다. `network-isolated` annotation을 붙여야 네트워크가 사라진다.
- 관측: `kubectl top`(metrics-server)과 stdout 로그(Fluent Bit → CloudWatch Logs)는 sandbox pod도 수집한다. Container Insights(amazon-cloudwatch-observability v7.0.1)의 pod 성능 데이터에는 sandbox pod이 없다.
- 판정 방법: 작은 모델 코드는 자주 틀리므로 같은 코드를 runc 기준 환경과 함께 돌리고, 모두 같은 예외로 죽으면 코드 문제로 보고 재생성한다. 이 장치 없이 "sandbox가 막았다"고 판정하면 오판한다.
