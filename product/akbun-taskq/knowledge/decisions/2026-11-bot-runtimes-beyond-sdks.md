---
type: Decision
title: ChatGPT-plan and Kiro bots run their own CLIs per turn, with taskq's tools served over MCP
description: OpenAI bots pick API key, Bedrock or the ChatGPT plan (codex exec); Kiro bots run kiro-cli headless with the user's AWS SSO session; both get the bot's team tools from `taskq mcp --bot`.
tags: [bots, openai, codex, kiro, aws]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-20T00:00:00Z }
---

## 결정

- OpenAI bot은 로그인 방식(`provider`)을 고른다. `api`와 `bedrock`은 OpenAI Agents SDK를 쓰고 `chatgpt`는 사용자의 Codex CLI(`codex exec`)를 turn마다 실행한다.
- Kiro bot은 사용자의 `kiro-cli`를 headless로 turn마다 실행한다. 로그인은 IAM Identity Center device flow이고 taskq는 토큰을 갖지 않는다.
- 프로세스로 도는 런타임은 bot 도구를 `taskq mcp --bot <name>` MCP server로 받는다. 검사는 in-process 도구와 같다.
- `@openai/codex-sdk`는 의존성으로 넣지 않고 같은 인자로 CLI를 직접 실행한다.
- Bedrock은 Chat Completions endpoint를 쓰고 대화를 bot 폴더에 보관한다.
- turn마다 모델과 토큰을 기록해 Usage 화면과 context 원을 만든다. ChatGPT 구독은 비용 0, Kiro는 credit으로 센다.
- OpenAI와 Kiro bot의 로그인 실패는 그 bot만 끈다. Claude 로그인 실패만 팀을 멈춘다.
- 로그인 실패는 확실할 때만 판정한다. Kiro는 오류 글이 로그인만을 뜻하면 바로, `AccessDenied`·401·403·`dispatch failure`처럼 뜻이 여럿이면 `kiro-cli whoami`가 0이 아닌 종료와 "Not logged in"으로 답할 때만 로그인 실패다. whoami의 시간 초과는 증거가 아니다. Bedrock은 오류 글이 아니라 AWS 프로파일이 자격 증명을 주는지로 판정한다. bot을 끄는 일이라 틀린 판정의 값이 크고, 글로만 고르면 모델 접근 거부까지 로그인 실패가 된다.
- Kiro 로그인은 터미널 아래에서 실행한다(expect, 없으면 util-linux script). kiro-cli는 start URL과 region을 인자로 받아도 터미널에서 다시 묻고 터미널이 없으면 끝난다.
- 로그인 실패로 꺼진 bot과 멈춘 팀은 사용자가 설정 > 연결에서 다시 확인한 검사가 통과할 때 되돌린다. hub가 끈 bot은 `team_signed_out:<bot>` meta로 표시하고, 사용자가 직접 켜거나 끄면 표시를 지운다. 다른 설정만 저장하면 표시가 남는다. 로그인 방식을 바꾸는 것이 로그인 실패를 고치는 흔한 방법이기 때문이다. UI가 1분마다 읽는 캐시된 검사로는 되돌리지 않는다. AWS 프로파일을 쓰는 Bedrock만 예외로 그 검사에서도 되돌린다. 검사와 실패 판정이 둘 다 "프로파일이 자격 증명을 주는가"라서 켜졌다 꺼지기를 되풀이하지 않기 때문이다. `OPENAI_API_KEY`처럼 값이 있는지만 보는 검사는 틀린 키에도 통과하므로, 자동으로 되돌리면 bot이 매분 켜졌다 꺼지기 때문이다.
- SDK나 로그인 방식을 바꾸면 세션, context, 세션 비용을 비운다.

## 이유

- ChatGPT 구독으로 모델을 쓰는 공식 방법은 Codex에 ChatGPT로 로그인하는 것이다. 구독 토큰을 꺼내 API처럼 쓰면 지원되지 않는 경로가 된다. Kiro도 SSO 세션을 kiro-cli가 보관하고 headless 실행을 지원한다. 두 경우 모두 CLI가 인증의 주인이라 taskq는 실행만 맡는 편이 맞다.
- CLI는 taskq의 in-process 도구를 부를 수 없다. 둘 다 MCP server를 붙일 수 있어서, bot 도구를 MCP로 내면 메시지·task·wiki·workflow가 SDK와 상관없이 같은 코드로 돈다.
- `@openai/codex-sdk`는 13 KB짜리 실행 래퍼인데 의존하는 `@openai/codex`가 플랫폼 바이너리 약 400 MB를 설치한다. CI와 release binary에 그 크기를 싣지 않으려고 같은 인자를 직접 넘겼다. Codex CLI 인자가 바뀌면 `codex.ts`를 고쳐야 하는 대가가 있다.
- Bedrock의 OpenAI 호환 endpoint(bedrock-runtime)는 Responses API를 지원하지 않는다. 서버 대화 상태가 없으므로 이력을 직접 들고 간다.
- 프로세스 런타임의 자체 도구는 taskq 게이트를 지나지 않는다. 경계는 Codex 샌드박스와 Kiro trust 목록·샌드박스이고, 이 차이를 문서와 bot 설정 안내에 적었다.
- Claude bot은 모두 같은 Claude Code 로그인을 쓰므로 한 bot의 실패가 곧 전체의 실패다. OpenAI 키, Codex, kiro-cli 로그인은 bot마다 다를 수 있어서, 팀을 멈추면 로그인과 상관없는 Claude bot까지 서게 된다. 처음에는 팀 정지로 통일했으나 런타임이 늘어난 뒤 범위를 bot으로 좁혔다.
- 세션 id는 런타임마다 뜻이 다르다(Claude 세션, Responses id, Codex thread, Kiro 세션). 다른 런타임의 id로 resume하면 실패하거나 엉뚱한 이력을 불러오므로 바꾸는 순간 비운다.
- 실제 계정으로 돌려 보지 않았다. 로그인의 터미널 실행은 kiro-cli처럼 묻는 대역 스크립트로만 확인했고, 오류 글과 `--list-models`의 JSON 모양은 실제 출력으로 맞춰 보지 못했다. Kiro stream-json 형식은 문서에 없어 아는 필드만 읽는다.

관련: [OpenAI bots plug in behind TeamBackend](2026-11-openai-bot-backend.md), [operations for the CLI and MCP](2026-11-operations-for-cli-and-mcp.md)
