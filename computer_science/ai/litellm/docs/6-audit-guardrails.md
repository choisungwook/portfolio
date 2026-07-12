# 누가 얼마 썼는지 남기고, 위험한 요청을 gateway에서 막는다

보안팀의 다음 질문은 둘이다. "사고가 나면 누가 무엇을 보냈는지 추적되나"(audit), "민감한 정보나 금칙 요청을 막을 수 있나"(guardrail). 두 기능 모두 gateway가 단일 경로라서 가능하다. 이 문서는 spend log로 사용 내역을 조회하고, guardrail로 요청을 걸러낸다. 실습 환경은 [2-setup.md](2-setup.md)에서 띄운 gateway를 쓴다.

## spend log: 모든 호출이 DB에 남는다

[set-model/config.yaml](../install/set-model/config.yaml)의 `store_prompts_in_spend_logs: true` 덕분에, 모든 요청이 어떤 key로 어떤 모델에 얼마를 썼는지 Postgres에 기록된다. 이건 별도 로깅 시스템을 붙인 게 아니라 gateway가 지나는 트래픽을 그대로 적는 것이다.

key별 사용 내역은 spend 관련 endpoint로 조회한다.

```bash
# key별 누적 사용액 요약
curl -s http://localhost:4000/spend/logs \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY"
```

응답에는 요청 시각, 사용한 key, 모델, 토큰 수, 비용이 들어 있다. audit이 "나중에 붙이는 기능"이 아니라 "트래픽이 지나가는 자리에 원래 있는 기록"이 되는 게 gateway 구조의 이점이다. 여기서 "감사 로그를 별도로 서명·보관해야 하지 않나" 싶을 텐데, 그런 규제 수준의 감사 로그(store_audit_logs, 변경 이력 추적)는 LiteLLM enterprise 기능이다. OSS에서는 이 spend log 조회와 표준 logging callback 연동으로 대체한다.

## guardrail: 요청이 provider에 닿기 전에 검사한다

guardrail은 요청(pre_call)이나 응답(post_call) 사이에 끼어 내용을 검사·수정하는 hook이다. gateway가 트래픽 경로라서, 애플리케이션이 무엇이든 여기서 한 번 걸면 우회가 없다.

자체 완결적인 예로 secret 탐지 guardrail을 쓴다. 프롬프트에 API key나 자격증명 같은 비밀이 섞여 들어가는 것을 막는 built-in guardrail이라 외부 서비스가 필요 없다. config.yaml에 아래를 더한다.

```yaml
guardrails:
  - guardrail_name: hide-secrets
    litellm_params:
      guardrail: hide-secrets   # 프롬프트 속 secret을 탐지·마스킹하는 built-in
      mode: pre_call            # provider로 나가기 전에 검사
      default_on: true          # 모든 요청에 적용
```

[2-setup.md](2-setup.md)의 기동 명령으로 다시 띄우면 guardrail이 로드된다. 이제 프롬프트에 `sk-`로 시작하는 가짜 key 같은 secret 패턴을 넣어 요청하면, 그 값이 마스킹된 채 provider로 나간다. 실무에서 자주 겪는, 로그·프롬프트에 자격증명이 실려 유출되는 사고를 gateway 층에서 차단하는 것이다.

PII 마스킹(주민번호·이메일 등)이나 금칙어·프롬프트 인젝션 차단처럼 더 정교한 guardrail은 presidio 같은 별도 서비스나 외부 guardrail provider를 붙여야 한다. 원리는 같다 — 검사 지점이 gateway라는 것. 구체 provider 연동은 실습 시점의 [LiteLLM guardrails 문서](https://docs.litellm.ai/docs/proxy/guardrails/quick_start)에서 확인한다.

## 왜 이 검사를 애플리케이션이 아니라 gateway에 두나

[4-auth-rate-limit.md](4-auth-rate-limit.md)의 한도와 같은 논리다. 검사를 애플리케이션마다 구현하면 빠지는 곳이 생기고 우회가 쉽다. gateway는 모든 LLM 트래픽의 병목이라, 여기 건 guardrail은 예외 없이 적용된다. audit과 guardrail이 gateway의 대표 기능인 이유가 이 "단일 경로" 성질에 있다.

## 다음

지금까지 라우팅·인증·한도·감사·guardrail을 전부 curl로 걸었다. 이 모든 걸 한 화면에서 눈으로 관리하는 콘솔이 [7-web-ui.md](7-web-ui.md)다.
