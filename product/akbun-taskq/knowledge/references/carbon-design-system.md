---
type: Reference
title: Carbon Design System principles and patterns used by the taskq UI
description: Carbon's guiding principles, status indicator rules and notification rules, summarized from carbondesignsystem.com.
tags: [ui, design-system]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-16T00:00:00Z }
sources:
  - id: what-is-carbon
    resource: https://carbondesignsystem.com/all-about-carbon/what-is-carbon/
    title: What is Carbon
  - id: status-indicator
    resource: https://carbondesignsystem.com/patterns/status-indicator-pattern/
    title: Status indicator pattern
  - id: notification
    resource: https://carbondesignsystem.com/patterns/notification-pattern/
    title: Notification pattern
---

# Carbon Design System

## 원칙

Carbon은 원칙 5개를 둔다[^what-is-carbon].

- Open: 오픈 소스 방식으로 함께 만든다.
- Inclusive: 능력이나 상황과 관계없이 누구나 쓸 수 있게 만든다.
- Modular and flexible: 조합해서 쓰도록 나눈다.
- User first: 사용자 조사를 근거로 실제 사람에게 맞춘다.
- Consistency: 모든 요소가 함께 동작하도록 처음부터 설계한다.

## 라이선스

- 코드와 `@carbon/themes`의 토큰은 Apache-2.0이다. 상업적 사용이 가능하고 라이선스 사본과 고지를 남겨야 한다.
- IBM Plex 글꼴은 SIL OFL 1.1이다. taskq는 글꼴 파일을 싣지 않고 설치되어 있을 때만 쓴다.
- IBM 이름과 로고는 라이선스 대상이 아니므로 쓰지 않는다.

## 상태 표시 규칙

- 색만으로 상태를 전하지 않는다. 기호, 모양, 색, 글 중 2개 이상을 함께 쓰고, 라벨을 붙이는 쪽을 권한다[^status-indicator].
- 주의 수준은 3단계다. high는 즉시 조치(오류, 확인 필요), medium은 조치 불필요(진행, 확인), low는 볼 것이 준비됨이다.
- 색: red 60 오류, orange 40/60 심각한 경고, yellow 30/60 경고, green 50 성공, blue 70 진행과 수동 알림, gray 60 초안과 시작 전, purple 60 정의되지 않은 상태. 밝은 테마에서 orange와 yellow는 60 shade를 테두리와 글에 쓴다.
- 상태 색끼리, 그리고 배경과 3:1 이상 대비를 지킨다.
- 같은 모양을 다른 색으로 쓰지 않는다. 표시가 5~6개를 넘으면 사용자가 지친다.

## 알림 규칙

- Inline: 작업 근처에 두고 사용자가 닫거나 해결할 때까지 남는다. 2줄 이내[^notification].
- Toast: 특정 영역과 무관한 짧은 알림. 동작이 있으면 사용자가 닫을 때까지 남는다.
- Actionable: 사용자 응답이 필요한 알림. 동작은 하나만 둔다.
- Banner: 제품이나 시스템 수준 알림. 콘텐츠 위, header 아래에 한 번에 하나만 둔다.
- Notification panel: 여러 시스템 메시지를 시간 순으로 모은다.
- 치명적인 메시지는 타이머로 사라지게 하지 않는다. 잦은 알림은 피로를 만든다.
