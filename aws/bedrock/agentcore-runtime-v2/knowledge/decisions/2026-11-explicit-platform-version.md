---
type: Decision
title: runtime마다 platform_version을 명시하고, 생략한 runtime 하나는 기본값 관찰용으로만 둔다
description: 발표문의 "서울 신규 runtime V2 기본"과 달리 API로 생략하면 V1이 되므로 실습 runtime은 V1, V2를 명시한다
tags: [bedrock, agentcore, terraform]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-13T09:40:00Z }
sources:
  - id: whats-new
    resource: https://aws.amazon.com/ko/about-aws/whats-new/2026/11/new-agentcore-runtime-default/
    title: AWS What's New, AgentCore Runtime 새 기본값
  - id: devguide
    resource: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-how-it-works.html
    title: AgentCore 개발자 가이드 Platform versions
---

## 결정

- `rtv2_legacy`와 `rtv2_v2`는 `platform_version`을 `V1`, `V2`로 명시한다.
- `rtv2_default`는 `platform_version`을 생략해 서비스 기본값을 관찰하는 용도로만 쓰고, V1과 V2 비교에는 쓰지 않는다. 다만 `rtv2_legacy`를 V2로 바꾼 뒤 V1이 필요한 시나리오 3, 5는 `rtv2_default`를 V1 대표로 쓴다.

## 이유

- 발표문[^whats-new]은 서울 신규 runtime에 V2가 기본 적용된다고 쓰지만, 개발자 가이드[^devguide]와 Terraform provider 문서는 생략하면 V1이라고 쓴다. 2026-11-13 실측도 V1이었다.
- 기본값이 문서마다 다르므로 생략에 기대면 실습 결과가 시점마다 달라진다. 기본값이 V2로 바뀌면 `rtv2_default`의 status 출력만 달라지고 나머지 시나리오는 그대로 재현된다.
- 콘솔 생성 화면의 기본 선택은 확인하지 않았다.
