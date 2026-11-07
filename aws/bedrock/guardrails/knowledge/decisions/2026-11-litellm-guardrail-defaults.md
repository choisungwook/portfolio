---
type: Decision
title: LiteLLM에 붙일 Bedrock guardrail 기본 구성
description: Bedrock guardrail 하나를 가리키는 LiteLLM guardrail 다섯 개(검사 시점, 검사 범위, 스트리밍 방식별)로 입력은 pre_call + 마스킹, 출력은 buffered post_call, PII는 방향별 action 명시
tags: [bedrock, guardrails, litellm]
timestamp: 2026-11-07T00:00:00Z
---

## 결정

- input guardrail은 `pre_call` + `mask_request_content`로 둔다. `during_call`은 쓰지 않는다.
- 스트리밍 output guardrail은 유출 0이 필요하면 buffered(기본값), 첫 토큰도 빨라야 하면 `streaming_buffer_release_on_scan`을 쓴다. `streaming_buffer_until_moderated: false` + sampling은 쓰지 않는다.
- guardrail은 Terraform으로 관리하고, PII와 regex 항목에는 `input_action`, `output_action`을 항상 명시한다. Terraform 코드는 AWS profile을 지정하지 않고 셸의 `AWS_PROFILE`을 따른다.
- LiteLLM guardrail은 다섯 개를 두고 모두 같은 Bedrock guardrail을 가리킨다. 멀티턴 비교용 `guardrails-input-latest`(`experimental_use_latest_role_message_only`)를 더했다. `guardrails-handson`(`[pre_call, post_call]`), `guardrails-input`(`[pre_call]`), `guardrails-output`(`[post_call]`, buffered), `guardrails-output-release`(`[post_call]`, release). 시나리오는 요청의 `guardrails` 필드로 고른다. sampled와 eos는 측정 표로만 남긴다.
- Bedrock guardrail은 input용과 output용으로 나누지 않는다. Terraform은 하나만 만든다.
- `contextual_grounding_from_messages`, `checks`(InvokeGuardrailChecks), `during_call`은 기본 구성에 넣지 않는다.
- LiteLLM 콘솔 실습을 위해 compose에 Postgres를 둔다. spend log는 남기고 `store_prompts_in_spend_logs: false`를 config에 명시해 요청과 응답 본문은 저장하지 않는다.
- guardrail은 요청 파라미터(`guardrails`)로 건다. `default_on`은 config에 넣지 않고 적용 방법 문서에서만 다룬다.

## 이유

- `during_call`은 차단된 요청에도 Converse를 호출했다. 지연 이득(약 0.5초)보다 차단 요청의 모델 비용과 PII 외부 전송이 크다.
- sampled 모드는 release와 ApplyGuardrail 호출 수(30회)와 총 시간이 같은데 차단 전 52자를 유출했다.
- `action: ANONYMIZE`만 적은 버전은 INPUT에서 PII를 탐지하지 않았다. BLOCK은 INPUT에서도 동작해 놓치기 쉽다.
- 다른 핸즈온과 IaC 방식을 맞추려고 CLI 스크립트 대신 Terraform을 쓴다. provider의 `input_action`은 optional+computed라 코드에서 지워도 AWS 값이 남으므로, 함정 재현은 별도 guardrail(`create_pii_pitfall_demo`)로 한다.
- `ap-northeast-2`의 InvokeGuardrailChecks는 AccessDenied였고 `us-east-1`, `us-west-2`는 동작했다(2026-11-07).
- `contextual_grounding_from_messages`는 system 프롬프트가 있는 모든 요청을 채점한다. 서울 리전 grounding은 한국어 미지원 Classic tier라 정답에도 0.1~0.2점으로 차단됐다(2026-11-07).
- 콘솔 Guardrails Monitor의 판정, 지연, unit, 비용은 본문 없이도 spend log 메타데이터만으로 집계된다. 본문을 켜면 guardrail이 가린 PII 원문까지 DB에 남는다(2026-11-07).
- 차단 근거는 spend log의 `error_information`에 `assessments`(policy, type, confidence, action)로 남고 `match` 원문은 `[REDACTED]`였다. 그래서 요청별 근거를 위해 CloudTrail 데이터 이벤트를 켜지 않는다. trail은 `enable_guardrail_data_events`(기본 false)로만 둔다(2026-11-07).
- 고객 문의 대응은 고객별 virtual key(`key_alias`), 요청 본문의 `user`, 응답 헤더 `x-litellm-call-id` 세 단서로 한다. 콘솔 시각은 현지 시각인데 상세 화면은 `Z`를 붙여 보여 주므로 API의 UTC와 9시간 차이가 난다(2026-11-07).
- 멀티턴 input 검사는 기본으로 대화 전체를 한 번의 ApplyGuardrail에 넣는다. 20턴(9,460자)에서 10 unit, ApplyGuardrail 약 0.75초였고, 마지막 메시지만 검사하면 1 unit이지만 조작된 과거 대화를 통과시켰다. 그래서 기본 guardrail에는 전체 검사를 두고 latest는 비교용으로만 둔다(2026-11-07).
- `x-litellm-applied-guardrails` 헤더는 요청에 적힌 이름을 그대로 돌려줘서, 등록되지 않은 이름도 찍힌다. guardrail 실행 여부는 spend log의 `guardrail_information`이 비었는지로 판단한다. release 방식의 스트리밍 도중 차단은 9건 중 5건이 spend log에 남지 않아(원인 확인 필요) 고객 쪽 `error` 이벤트를 1차 근거로 삼는다(2026-11-07).
- LiteLLM 콘솔은 DB가 없으면 로그인에서 `Not connected to DB!`로 실패한다.
- `default_on: true`를 켜면 `"guardrails": []` 요청도 차단되어 시나리오 3, 4의 guardrail 없음 비교를 같은 프록시에서 할 수 없다. 예외는 key metadata(`disable_global_guardrails`, `opted_out_global_guardrails`)로만 둘 수 있었다(2026-11-07).
- 처음에는 1:1 하나만 두고 시나리오마다 `mode`와 스트리밍 옵션을 바꿔 LiteLLM을 다시 띄웠다. Docker Desktop에서 재기동이 멈추는 일이 반복됐고, 시나리오마다 되돌리기 단계가 필요했다. LiteLLM guardrail은 이름만 다른 호출 설정이라 여러 개를 둬도 Bedrock 비용은 호출 수로만 정해지므로, 나눠 두고 재기동을 없앴다(2026-11-07).
- Bedrock 쪽을 나누지 않은 것은 이 실습의 정책이 input과 output에 같기 때문이다. 방향별로 정책이 다르면(예: output에만 grounding) Bedrock guardrail을 나눈다. 같은 Bedrock guardrail을 공유하면 CloudWatch 메트릭이 LiteLLM guardrail별로 나뉘지 않는다. 방향은 `GuardrailContentSource` 차원으로만 구분된다.
- LiteLLM 1.108.2 Bedrock hook은 fail-open 옵션(`unreachable_fallback`)이 없어 guardrail 오류가 곧 요청 실패다.

## Citations

1. 측정값: [docs/3-litellm-guardrail-modes.md](../../docs/3-litellm-guardrail-modes.md), [docs/9-streaming-output-guardrail.md](../../docs/9-streaming-output-guardrail.md)
2. LiteLLM 1.108.2 `litellm/types/guardrails.py`의 `unreachable_fallback` 설명(구현 대상 목록에 bedrock 없음)
