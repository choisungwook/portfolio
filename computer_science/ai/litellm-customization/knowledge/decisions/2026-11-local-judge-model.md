---
type: Decision
title: 판정 모델은 로컬 Ollama gemma2:2b를 CPU 전용으로 쓴다
description: 4·5단계의 라우팅 판정을 비용 없이 누구나 재현하려고 JEV 대신 로컬 소형 모델을 num_gpu 0으로 돌린다
tags: [litellm, ollama, routing, complexity-router]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-14T01:00:00Z }
---

## 결정

4단계 훅과 5단계 `complexity_router`의 LLM 분류기는 같은 별칭 `router-judge`(`ollama_chat/gemma2:2b`, `num_gpu: 0`, `temperature: 0`)를 쓴다. 답변 모델은 계속 mock이다.

## 이유

- JEV(`classifier_type: jev`, `oss_classifier`)는 LiteLLM 1.109.1 소스에서 TypeSafe 호스팅 API(`api.typesafe.ai`)를 `TYPESAFE_API_KEY`로 부른다. 로컬에서 돌릴 수 없고 키와 비용이 필요해 재현성이 떨어진다.
- `gemma3:1b`는 영어 전용이라 한국어 질문 판정에 맞지 않는다. `gemma2:2b`는 한국어 질문 네 개를 의도대로 나눴다.
- CPU 전용은 GPU 없는 독자 환경과 같은 조건이다. 대가는 지연이다. Apple M3 Pro에서 판정 한 번에 10~22초가 걸렸고(같은 측정에서 `qwen2.5:1.5b`는 GPU 0.3초, CPU 약 5초), 그래서 4단계 훅의 시간 제한을 30초로, 5단계의 `timeout_ms`를 30000으로 두었다. 기본값 3000이면 첫 요청에서 circuit이 열려 휴리스틱으로만 정한다.
- `qwen2.5:1.5b`에 한국어 판정 프롬프트를 주었을 때는 세 질문을 모두 `claude`로 오판했다. 판정 프롬프트는 영어로 둔다.
