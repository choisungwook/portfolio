# 콘솔 하나로 키·팀·스펜드를 눈으로 관리한다

지금까지 라우팅·인증·한도·감사를 전부 curl로 걸었다. 원리를 이해하는 데는 curl이 좋지만, 실무에서 매번 API를 손으로 치지는 않는다. LiteLLM은 관리 콘솔을 함께 준다. 이 문서는 콘솔에 로그인해 앞에서 API로 만든 key·team을 눈으로 확인하고, 콘솔에서 직접 key를 발급하고, 스펜드 대시보드와 요청 로그를 본다. 실습 환경은 [2-setup.md](2-setup.md)에서 띄운 gateway를 그대로 쓴다.

## 콘솔 로그인 준비

콘솔은 gateway와 같은 포트의 `/ui` 경로에 있다. 로그인 계정은 master key가 아니라 별도의 `UI_USERNAME`·`UI_PASSWORD`다. [set-model/docker-compose.yaml](../install/set-model/docker-compose.yaml)이 이 두 값을 `.env`에서 컨테이너로 주입한다.

`.env`에 두 값을 채운다(예시는 [set-model/.env.example](../install/set-model/.env.example)에 있다).

```bash
UI_USERNAME=admin
UI_PASSWORD=admin-change-me
```

값을 바꿨으면 [2-setup.md](2-setup.md)의 기동 명령으로 컨테이너를 다시 띄운 뒤, 브라우저로 콘솔에 접속해 이 계정으로 로그인한다.

```text
http://localhost:4000/ui
```

## 방금 만든 것들이 다 여기 있다

로그인하면 왼쪽에 Virtual Keys, Teams, Internal Users, Models 같은 메뉴가 보인다. [4-auth-rate-limit.md](4-auth-rate-limit.md)에서 발급한 key, [5-team-user.md](5-team-user.md)에서 만든 `platform` 팀과 `dev-a` user가 그대로 목록에 나타난다. curl로 친 것과 콘솔이 같은 Postgres를 보기 때문이다. API와 UI는 같은 상태를 다른 창으로 보는 것뿐이다.

각 항목을 열면 그 key·팀에 걸린 모델 제한, 예산, rpm이 폼으로 보인다. curl 응답의 JSON을 읽던 것을 여기서는 표로 확인한다.

## 콘솔에서 key를 발급한다

같은 일을 콘솔에서도 해본다. Virtual Keys 화면에서 새 key 생성을 누르면, curl `-d`에 넣던 값들이 폼 항목으로 나온다.

- 접근 가능한 모델(`models`) — `gemini`만 선택
- 소속 팀(`team_id`) — `platform` 선택
- 예산(`max_budget`)·분당 요청 수(`rpm_limit`)

생성하면 `sk-`로 시작하는 key가 한 번 표시된다. 방금 발급한 key는 목록에도 즉시 나타나고, 이 key로 `gpt`를 부르면 [4-auth-rate-limit.md](4-auth-rate-limit.md)에서 본 것과 똑같이 거부된다. 통제 규칙은 API로 걸든 콘솔로 걸든 동일하게 gateway에 저장된다.

## 누가 얼마 썼는지 대시보드로 본다

Usage(또는 Spend) 화면은 [6-audit-guardrails.md](6-audit-guardrails.md)에서 `/spend/logs`로 조회하던 데이터를 그래프로 보여준다. key별·team별·모델별 누적 사용액과 요청 수가 시간축으로 쌓인다. "이번 달에 어느 팀이 제일 많이 썼나"를 JSON을 파싱하지 않고 한눈에 본다. 비용 통제를 요구하는 보안팀이 실제로 보는 화면이 이것이다.

## 요청 로그로 개별 호출을 추적한다

Logs 화면에서는 개별 요청을 하나씩 들여다본다. [set-model/config.yaml](../install/set-model/config.yaml)의 `store_prompts_in_spend_logs: true` 덕분에 언제, 어떤 key로, 어떤 모델에, 어떤 프롬프트가 나갔고 토큰·비용이 얼마였는지가 행 단위로 남는다. 사고가 났을 때 "누가 무엇을 보냈나"를 되짚는 audit의 실제 도구다.

## OSS와 enterprise 경계

콘솔 자체와 key·team·user 관리, 스펜드 대시보드, 요청 로그 조회는 OSS 기능이다. `UI_USERNAME`/`UI_PASSWORD` 단일 계정 로그인도 OSS다. 조직의 SSO/SAML 연동 로그인, 변경 이력을 서명·보관하는 audit log, 화면별 세분화된 RBAC은 enterprise tier다. 학습·소규모 운영은 OSS 콘솔만으로 충분하고, 이 실습도 그 범위 안에서 다뤘다.

## 다음

콘솔로 gateway를 관리하는 법까지 봤다. 이제 이 gateway에 실제 client(python·Codex)를 코드 수정 없이 붙이는 [8-connect-clients.md](8-connect-clients.md)로 넘어간다.
