---
type: Decision
title: Navigation is a left sidebar where bots read like chats, and the user-facing name is Bots
description: A left sidebar holds the orchestrator, new task and search, every view and the bot chat list, with alerts and settings at its foot; there is no tab row or top bar, and Team is only the internal name.
tags: [ui, navigation, bots]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T15:00:00Z }
---

## 결정

- 사용자에게 보이는 이름은 Team이 아니라 Bots다. UI, CLI(`taskq bots`), API(`/api/bots`), 설정 키(`bots`)가 이 이름을 쓴다. 코드와 테이블 이름(`src/team/`, `team_*`)은 그대로 둔다.
- 화면 전환은 왼쪽 사이드바 하나로 한다. 탭 줄과 상단 바는 없다. 위에서부터 오케스트레이터 taskq(가운데 큰 아바타), 새 작업과 검색, 모든 화면 메뉴(Calendar, task 상태보드, 주간 점검(0.33.0부터, 설정에서 옮김), 공용 폴더, Workflows, Plugins, Wiki), Bots 목록이고, 맨 아래에 확인 필요(종)와 설정 아이콘이 있다.
- Bots 목록은 채팅 목록처럼 bot마다 아바타, 이름, 최근 메시지, 시각, 읽지 않음 점을 보인다. bot을 누르면 그 bot과의 대화가 말풍선으로 열리고 거기서 메시지를 보낸다.
- Graph, Proposals, Goals, Discussions는 화면 메뉴가 없다. Graph를 뺀 나머지 기능은 API, CLI, bot 도구로 남아 있고 `/api/graph`도 남아 있다.
- 색과 모양은 이 결정의 대상이 아니다. [Astryx 토큰 결정](2026-11-astryx-design-system.md)에 있다.

## 이유

- 사용자가 참고로 준 화면은 bot마다 대화방이 하나인 메신저 목록이었다. bot이 상주하며 대화를 이어 간다는 모델과 맞고, 패널 하나에 모든 메시지를 섞어 보이는 것보다 누가 무슨 말을 했는지 찾기 쉽다.
- 사이드바로 옮기면 화면 전환과 bot 선택이 한 메뉴에 모인다. 탭 줄에 bot까지 더하면 넘친다.
- 메뉴를 위에 모은 것은 bot이 늘어도 메뉴가 화면 밖으로 밀려나지 않게 하려는 것이고, taskq를 따로 둔 것은 사용자가 가장 먼저 말을 거는 상대라서다.
- 상단 바에 있던 것은 앱 이름, 지난 실행 검색, 종, 설정뿐이었다. 지난 실행은 검색 dialog의 작업 탭에서 찾으므로 종과 설정을 사이드바로 옮기고 바를 없앴다.
- 이름을 사용자 표면에서만 바꾼 이유는 내부 이름까지 바꾸면 마이그레이션과 테스트를 모두 손대야 하는데 얻는 것이 없기 때문이다. 두 이름의 대응은 wiki architecture에 적었다.

## 잃는 것

- 내부 이름과 표면 이름이 달라 코드를 처음 읽는 사람이 둘을 연결해야 한다.
