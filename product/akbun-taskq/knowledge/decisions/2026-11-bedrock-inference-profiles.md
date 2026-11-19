---
type: Decision
title: OpenAI on Bedrock calls inference profiles, listed with a hand-written SigV4 request
description: The model list comes from ListInferenceProfiles and openai.* ids are swapped for the region's us./global. profile; the request is signed with node:crypto instead of an AWS SDK client.
tags: [bots, openai, bedrock, aws]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-19T16:00:00Z }
---

## 결정

- OpenAI bot on Bedrock의 모델 목록은 설정의 AWS 프로파일로 `ListInferenceProfiles`(GET `bedrock.<region>.amazonaws.com/inference-profiles`)를 불러 `openai.`가 든 profile로 채운다. 10분 캐시한다.
- turn마다 모델 ID가 `openai.`로 시작하면 region의 지역(`us`, `eu`, `apac`, `jp`, `au`) 다음 `global` 순으로 같은 모델의 profile을 찾아 그 ID로 부른다. 맞는 profile이 없으면 입력한 ID를 그대로 쓴다(`openai.gpt-oss-*`처럼 on-demand로 되는 모델).
- 목록 조회의 SigV4 서명은 `src/aws/profiles.ts`의 `signGet`으로 `node:crypto`만 써서 만든다. AWS 문서의 서명 예제 두 개를 테스트로 고정했다.
- Bedrock API 키(`AWS_BEARER_TOKEN_BEDROCK`)만 있을 때는 조회하지 않고 내장 목록과 입력한 ID를 쓴다. 조회가 실패해도 turn은 실패하지 않는다.

## 이유

- 새 OpenAI 모델은 Bedrock에서 cross-region inference profile로만 호출되어, 내장 목록의 `openai.*` ID를 그대로 보내면 실패했다.
- `@smithy/signature-v4`는 설치 트리에 있지만 직접 의존성이 아니고, 이 환경의 npm 레지스트리에는 해당 버전이 없어 추가할 수 없었다. 서명은 GET 하나라 40줄로 충분하고, 전이 의존성에 기대면 다른 패키지가 올라갈 때 조용히 깨진다.
- profile은 사용자가 고른 region에 있는 것만 맞다. 다른 region의 profile을 고르면 endpoint가 거부하므로, 목록에 실제로 있는 ID로만 바꾼다.
