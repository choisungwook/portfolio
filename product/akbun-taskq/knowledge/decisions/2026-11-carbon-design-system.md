---
type: Decision
title: The taskq UI follows IBM Carbon through a token interface
description: Carbon was chosen for its license, principles and status and notification patterns; the theme is one implementation of a token contract.
tags: [ui, design-system]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-16T00:00:00Z }
---

## 결정

- UI는 IBM Carbon Design System의 토큰(g10, g100)과 패턴(status indicator, notification, tabs, buttons, modal)을 따른다.
- Carbon CSS 패키지를 그대로 싣지 않는다. `ui/css/theme/contract.css`의 토큰 계약을 `ui/css/theme/carbon.css`가 구현하고, 컴포넌트 CSS는 계약 토큰만 읽는다. `test/ui-tokens.test.ts`가 이를 검사한다.
- 근거 자료는 [Carbon 사본](../references/carbon-design-system.md)에 있다.

## 이유

- 사용자 조건은 무료, 상업적 사용 가능, CSS가 아니라 철학이 있는 시스템, 단순하고 직관적일 것, UI/UX 규칙을 포함할 것이었다.
- Carbon은 Apache-2.0이라 상업적 사용 조건이 명확하고, 원칙 5개와 함께 상태 표시와 알림 규칙을 문서로 둔다. taskq는 상태 8개, 승인, 알림이 핵심이라 이 두 패턴이 그대로 쓰였다.
- U.S. Web Design System은 공개 도메인(CC0)이라 라이선스는 가장 단순하지만, 공공 서비스 양식 중심이라 상태가 많은 운영 대시보드 패턴이 적었다.
- GOV.UK Design System은 코드가 MIT이고 "단순하게"라는 철학이 가장 강하지만, 문서가 OGL이고 crown과 GOV.UK 글꼴 같은 브랜드 요소는 정부 서비스 밖에서 쓸 수 없어 경계를 매번 확인해야 했다.
- Carbon CSS를 통째로 싣지 않은 이유: no-build 정적 UI라 Carbon 클래스 이름에 맞춰 모든 view를 다시 써야 했고, 바이너리에 수백 KB가 더해진다. 토큰과 규칙만 옮기면 view 코드는 거의 그대로이고, [인터페이스 우선 결정](2026-11-interface-first.md)대로 테마를 바꿀 때 컴포넌트를 고치지 않는다.
