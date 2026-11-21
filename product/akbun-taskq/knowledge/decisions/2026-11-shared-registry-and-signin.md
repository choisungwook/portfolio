---
type: Decision
title: Registered skills, plugins and MCP servers are shared by type; every runtime signs in from one Connections section
description: Bots no longer pick from the registry, a Claude bot chooses its own sign-in like an OpenAI bot, Connections tests one method in 5 seconds, and routines were removed.
tags: [bots, plugins, connections, ui]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T15:00:00Z }
---

## 결정

- Plugins 메뉴에 등록한 skill, plugin, MCP server는 모든 bot이 타입에 맞게 쓴다. plugin은 Claude bot만 불러온다. bot 설정의 고르기 칸을 없앴고, `getAgent`가 registry에서 목록을 채워 저장된 bot별 목록은 읽지 않는다. 등록·삭제·설치·업데이트는 해당 bot의 사본을 모두 다시 만든다.
- Claude bot도 OpenAI bot처럼 `provider`(api, subscription, bedrock)를 가진다. 값이 없으면 설정 > 연결의 Claude 방식을 따른다. CHECK 제약을 넓히려고 migration 011이 `team_agents`를 복사해 다시 만든다.
- 연결 화면은 Claude, OpenAI, Kiro 절마다 방식 선택, 필요한 칸, 연결 테스트·저장·지우기만 둔다. 연결 테스트는 그 방식의 검사를 5초로 끊고, 저장은 테스트를 바로 돌린다. 지우기는 저장값을 지워 설정 파일과 환경 변수로 돌아간다.
- Claude 로그인 실패가 팀을 멈추는 이유는 [bot runtimes 결정](2026-11-bot-runtimes-beyond-sdks.md)에 있다. 멈춤 이유에 실패한 bot 이름이 있어서, 그 bot의 Claude 방식 검사가 통과할 때만 재개한다. 다른 방식이 통과해도 재개하지 않는다.
- 시작할 때 모든 bot의 skill·plugin 사본을 한 번 다시 만든다. 이전 버전에서 bot마다 고른 것만 담은 사본이 남아 있으면 공유가 지켜지지 않기 때문이다.
- OpenAI API key도 Anthropic key처럼 `TASKQ_HOME/data/openai-api-key`(0600)에 저장할 수 있다.
- routine 기능을 없앴다. migration 011이 `bot_routines`를 지운다. `team_messages.routine_id` 열은 남는다.

## 이유

- 사용자는 bot마다 같은 plugin을 고르는 일을 반복했다. 등록하는 곳이 한 곳이면 고르는 단계가 실수만 만든다. 타입별 차이(plugin은 Claude만)는 SDK가 정하는 것이라 사용자가 고를 일이 아니다.
- 대가는 위험 범위다. 이전에는 설치와 사용이 분리되어 고르기 전에는 plugin의 hook과 MCP server가 돌지 않았다. 지금은 등록이 곧 모든 Claude bot의 사용이다. 그래서 marketplace 설치의 commit 고정이 유일한 문턱이 되었다.
- bot 생성에서 인증 방식을 고르게 하자 Claude만 전역 하나라는 것이 어긋났다. 전역 값을 기본값으로 남긴 것은 기존 bot을 옮기지 않고 그대로 돌게 하려는 것이다. Claude 로그인 실패가 팀 전체를 멈추는 규칙은 그대로 두었다.
- 이전 연결 화면은 모든 연결을 카드로 보여 줬지만, 사용자는 지금 쓰는 방식이 되는지만 알고 싶어 했다. 카드 검사는 Bedrock preflight처럼 20초가 걸리는 것도 있어, 버튼 하나의 답은 5초로 끊었다. 시간 초과는 실패로 보이지만 로그인 실패로 bot을 끄는 근거로는 쓰지 않는다(그 판정은 turn이 한다).
- routine은 쓰이지 않았고 bot 설정을 길게 만들었다. 반복 일은 워크플로와 사용자의 직접 요청으로 남는다.

관련: [bot runtimes](2026-11-bot-runtimes-beyond-sdks.md), [marketplace install](2026-11-marketplace-plugin-install.md), [bots execute tasks](2026-11-bots-execute-tasks.md)
