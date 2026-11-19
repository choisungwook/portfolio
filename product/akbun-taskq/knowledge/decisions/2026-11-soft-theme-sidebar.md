---
type: Decision
title: The UI uses a soft messenger theme and a left sidebar where bots read like chats
description: Bots replace the Team tab as a chat list in a left sidebar; a new dark-first rounded theme implements the same token contract, and Carbon stays as a second theme.
tags: [ui, design-system, bots]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-19T15:00:00Z }
---

## 결정

- 사용자에게 보이는 이름은 Team이 아니라 Bots다. UI, CLI(`taskq bots`), API(`/api/bots`), 설정 키(`bots`)를 바꿨다. 코드와 테이블 이름(`src/team/`, `team_*`)은 그대로 둔다.
- 탭 줄을 없애고 왼쪽 사이드바로 옮긴다. 0.15.0부터 순서는 오케스트레이터 taskq(위 가운데 큰 아바타), 새 작업과 검색, 모든 화면 메뉴(Calendar, task 상태보드, 공용 폴더, Workflows, Plugins, Wiki), Bots 목록이다. 메뉴를 위에 모은 것은 bot이 늘어도 메뉴가 화면 밖으로 밀려나지 않게 하려는 것이고, taskq를 따로 둔 것은 사용자가 가장 먼저 말을 거는 상대라서다. Graph 화면은 0.15.0에서 지웠다.
- Proposals, Goals, Discussions 메뉴는 2026-11-19에 사용자 요청으로 뺐다. 기능(API, CLI, bot 도구)은 남기고 화면만 없앴다.
- 기본 테마는 2026-11-19부터 [Astryx](/decisions/2026-11-astryx-design-system.md)다. soft 테마는 두 번째 구현으로 남는다.
- Bots 목록은 채팅 목록처럼 bot마다 아바타, 이름, 최근 메시지, 시각, 읽지 않음 점을 보인다. bot을 누르면 그 bot과의 대화가 말풍선으로 열리고 거기서 메시지를 보낸다.
- 기본 테마를 `soft.css`로 바꾼다. 다크 우선, 둥근 모서리, 굵은 글씨, bot마다 다른 색과 모양의 아바타다. 토큰 계약에 아바타 색 8개와 큰 모서리(`--radius-l`)를 더했다. `carbon.css`는 같은 계약의 두 번째 구현으로 남긴다.

## 이유

- 사용자가 참고로 준 화면은 bot마다 대화방이 하나인 메신저 목록이었다. bot이 상주하며 대화를 이어 간다는 모델과 맞고, 패널 하나에 모든 메시지를 섞어 보이던 Team 탭보다 누가 무슨 말을 했는지 찾기 쉽다.
- 사이드바로 옮기면 화면 전환과 bot 선택이 한 메뉴에 모인다. 탭 다섯 개에 bot 다섯 개를 더하면 탭 줄이 넘친다.
- 테마를 새 파일로 만든 이유는 [Carbon 결정](2026-11-carbon-design-system.md)에서 테마를 토큰 계약의 구현으로 분리해 두었기 때문이다. 컴포넌트 CSS를 고치지 않고 색, 모서리, 글꼴을 바꿀 수 있었고, 상태 표시와 알림처럼 Carbon에서 가져온 패턴은 그대로 쓴다.
- 이름을 사용자 표면에서만 바꾼 이유는 내부 이름까지 바꾸면 마이그레이션과 테스트를 모두 손대야 하는데 얻는 것이 없기 때문이다. 두 이름의 대응은 wiki architecture에 적었다.

## 잃는 것

- Carbon 결정이 근거로 든 "Carbon의 원칙을 따르는 UI"는 색과 모양에서는 더 이상 맞지 않는다. 남은 것은 패턴이다.
- 다크 우선 테마는 밝은 사무실 화면에서 대비를 따로 확인하지 않았다. light 변형은 `prefers-color-scheme: light`에서만 쓰인다.
- 내부 이름과 표면 이름이 달라 코드를 처음 읽는 사람이 둘을 연결해야 한다.
