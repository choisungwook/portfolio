---
type: Decision
title: 실습 runtime은 platform_version = "V2"를 명시한 하나만 만들고, V1 값은 참고 측정으로만 둔다
description: API로 생략하면 V1이 되므로 V2를 명시하고, V1 비교 runtime은 코드에서 뺐다
tags: [bedrock, agentcore, terraform]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-13T13:40:00Z }
sources:
  - id: whats-new
    resource: https://aws.amazon.com/ko/about-aws/whats-new/2026/11/new-agentcore-runtime-default/
    title: AWS What's New, AgentCore Runtime 새 기본값
  - id: devguide
    resource: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-how-it-works.html
    title: AgentCore 개발자 가이드 Platform versions
---

## 결정

- Terraform은 `platform_version = "V2"`인 runtime `rtv2_v2` 하나만 만든다.
- 처음 버전에 있던 V1 runtime(`rtv2_legacy`)과 생략 runtime(`rtv2_default`)은 뺐다. 문서의 V1 값은 2026-11-13에 그 runtime들로 잰 참고 값이고, 재현하려면 `platform_version = "V1"` runtime을 따로 만든다.
- 시나리오 4는 V1→V2 전환 대신 V2 runtime의 환경 변수를 바꾸는 업데이트로 snapshot 교체를 잰다. 어느 버전이 응답했는지는 `INIT_MEMORY_MB`(512→1024)에 따른 `rss_mb`로 구분한다.

## 이유

- 발표문[^whats-new]은 서울 신규 runtime에 V2가 기본 적용된다고 쓰지만, 개발자 가이드[^devguide]와 Terraform provider 문서는 생략하면 V1이라고 쓴다. 2026-11-13 실측도 V1이었다. 생략에 기대면 시점마다 결과가 달라진다.
- 사용자가 실습을 V2 기능에 집중하도록 V2로만 만들기를 골랐다. runtime이 하나면 create 시간(V2 약 4분)과 비용이 줄고, V1 warm pool처럼 직전 호출 이력에 따라 결과가 갈리는 측정이 빠진다.
- V1→V2 전환과 V2 업데이트는 같은 snapshot 수명 주기를 따른다. 두 경우 모두 `UPDATING` 동안 새 session은 이전 버전, 기존 session은 끝날 때까지 이전 버전에 남았다.
