---
type: Decision
title: Track A 핸즈온을 team/user·web UI·client 연동까지 확장한다
description: A4 1장 제한을 풀고 team·user 권한 상속, 관리 콘솔, python·Codex client 연동 문서를 Track A에 추가한다. client 설정은 기존 환경을 건드리지 않게 격리한다.
tags: [ai, litellm, docs, handson]
timestamp: 2026-07-11T00:00:00Z
---

## 결정

- Track A 문서의 A4 1장 제한을 풀고, 검증이 curl-ping에 머물던 핸즈온을 실제 운영 시나리오까지 확장한다.
- 신규 문서 3편을 Track A 흐름에 삽입하고 Track B를 재번호한다. 5-team-user, 7-web-ui, 8-connect-clients를 넣고, 기존 5-audit-guardrails·6-setup·7-airgapped는 6·9·10으로 민다.
- client는 python(openai SDK)과 Codex CLI를 다룬다. 둘 다 base URL과 key만 gateway로 돌리고, 기존 설정을 건드리지 않게 격리한다. python은 전역 설정이 없어 롤백이 필요 없고, Codex는 CODEX_HOME으로 임시 설정 디렉터리를 써서 실습 후 디렉터리만 지우면 원복된다.
- Codex는 2026년부터 Chat Completions wire API를 없애고 Responses API만 지원하므로, LiteLLM이 노출하는 `/v1/responses`로 붙인다. LiteLLM은 이 endpoint에서 model_list의 어떤 모델이든 받아 chat 호출로 브릿지한다.

## 이유

- 문서가 A4 1장으로 묶여 있어 각 기능이 curl 한 줄로 끝났고, "gateway가 트래픽 경로에서 통제를 건다"는 핵심 가치가 실제 client·팀 운영으로 이어지지 못했다.
- 엔터프라이즈 인증/인가의 본체는 key 단위가 아니라 team·user 계층의 예산 상속이다. team·user·budget·rate limit은 OSS 기능이라 로컬 환경에서 그대로 재현된다. organization 계층, key별 model_max_budget, SSO, audit log는 enterprise라 범위에서 뺐다.
- web UI는 이 리소스를 실무자가 눈으로 관리하는 표준 경로이고, key·team·spend·log 관리는 OSS 콘솔로 충분하다.
- client를 격리 설정으로 붙이면 학습자가 자기 개발 환경을 깨지 않고 실습하고 원복할 수 있어 재현성이 높다.

## Citations

1. LiteLLM user/team budget API: <https://docs.litellm.ai/docs/proxy/users>
2. LiteLLM Responses API: <https://docs.litellm.ai/docs/response_api>
3. LiteLLM Admin UI: <https://docs.litellm.ai/docs/proxy/ui>
4. Codex config reference (custom provider, wire_api): <https://developers.openai.com/codex/config-reference>
