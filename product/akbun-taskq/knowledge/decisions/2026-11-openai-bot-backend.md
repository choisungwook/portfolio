---
type: Decision
title: OpenAI bots plug in behind TeamBackend, with tools chosen by permission mode
description: An OpenAI Agents SDK backend runs bots with the same hub, tools, limits and gate; the Responses API keeps the conversation, the permission mode picks file and shell tools, and cost is an estimate from tokens shown on the Usage page.
tags: [bots, agent-sdk, openai]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-20T00:00:00Z }
---

## 결정

- OpenAI bot은 `TeamBackend` 구현 하나(`src/agents/openai/team.ts`)로 붙인다. hub, mailbox, bot 도구 20개, 제한, 게이트는 Claude bot과 같다. bot마다 `sdk`를 고르고 hub가 SDK별 backend로 보낸다.
- 의존성은 `@openai/agents-core`와 `@openai/agents-openai`만 쓴다. realtime 패키지는 넣지 않는다.
- 대화는 Responses API가 서버에 둔다. 마지막 response id를 bot의 `session_id`로 저장하고 다음 turn에 `previousResponseId`로 넘긴다.
- OpenAI Agents SDK에는 권한 모드와 auto 모드가 없다. taskq가 파일·셸 도구를 직접 만들고 권한 모드로 준다. plan은 읽기, accept edits는 bot 폴더와 공용 폴더 쓰기, bypass는 셸까지다. 샌드박스를 켠 bot에게는 셸을 주지 않는다. 모든 호출은 `botGate`를 거친다.
- 실행 중 메시지 추가(live input)는 하지 않는다. 메시지는 다음 turn까지 큐에 쌓인다.
- 비용은 토큰 수에 설정 단가(`bots.openaiInputPerMTok`, `openaiOutputPerMTok`)를 곱해 추정하고 Usage 화면에만 쓴다. bot을 멈추는 데는 쓰지 않는다.
- skill은 Claude bot과 같은 등록을 쓴다. OpenAI SDK에는 skill 로더가 없어 `read_skill` 도구가 이름과 설명을 보이고 부르면 SKILL.md를 돌려준다. Claude Code plugin 형식은 OpenAI bot에 쓰지 않고, MCP server 등록을 두 SDK가 같이 쓴다(OpenAI는 `MCPServerStdio`).

## 이유

- [interface first](2026-11-interface-first.md) 결정대로 bot 쪽도 `TeamBackend` 뒤에 SDK를 숨겨 두었기 때문에, 새 SDK는 backend 한 파일과 hub의 선택 한 줄로 끝났다. 도구 handler가 SDK와 무관해서 zod 스키마를 JSON schema로 바꾸는 일만 남았다.
- auto 모드는 Claude Code가 호출마다 판단하는 기능이라 OpenAI 쪽에 대응물이 없다. 승인 대기(`needsApproval`)는 아무도 bot turn을 지켜보지 않으므로 쓸 수 없다. 남는 방법은 bot이 받는 도구 자체를 권한 모드로 줄이는 것이었다.
- taskq는 자식 프로세스를 Claude Code처럼 OS 샌드박스에 넣지 못한다. 샌드박스를 켰다는 설정을 믿고 셸을 주면 사용자는 없는 경계를 믿게 되므로 셸을 뺐다.
- API는 토큰만 주므로 달러로 보이려면 단가 설정이 필요하다. 추정값은 실제 청구와 다를 수 있어서 한도로 쓰지 않는다([예산을 없앤 결정](2026-11-rejected-turns.md)).
- 실제 API로는 돌려 보지 않았다. 테스트는 SDK 실행을 가짜로 바꿔 도구, 게이트, 세션, 오류 처리를 확인한다.

관련: [Agent SDKs plug in behind one AgentBackend interface](2026-11-agent-backend-interface.md), [Bots work on their own tasks](2026-11-bots-execute-tasks.md)
