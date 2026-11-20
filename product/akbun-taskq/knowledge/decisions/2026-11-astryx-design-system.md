---
type: Decision
title: The UI takes Meta's Astryx design tokens, not its React components
description: astryx.css is the theme the UI loads; it fills taskq's token contract with the Astryx neutral values, light by default, while the static UI stays framework-free and soft.css and carbon.css remain as unused implementations.
tags: [ui, design-system]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-20T00:00:00Z }
sources:
  - id: astryx
    resource: https://github.com/meta/astryx
    title: Astryx, Meta's open source design system (MIT)
---

## 결정

- 사용자가 디자인 시스템을 Astryx로 바꾸라고 했다. `ui/css/theme/astryx.css`가 [토큰 계약](2026-11-carbon-design-system.md)(`contract.css`)을 Astryx neutral 테마(`@astryxdesign/theme-neutral` 0.7.16) 값으로 채우고, `index.html`은 이 파일만 읽는다.
- 기본은 라이트다. 설정 > 화면에서 다크나 시스템으로 바꾼다.
- Astryx의 React 컴포넌트와 StyleX는 쓰지 않는다. 색, radius(12·10·6 px), 그림자, 글꼴 순서만 옮긴다.
- Figtree는 내려받지 않는다. 설치되어 있으면 쓰고, 한글은 시스템 한글 글꼴로 넘어간다.
- 이전 테마 파일 `soft.css`(다크 우선, 둥근 메신저 테마)와 `carbon.css`는 지우지 않고 같은 계약의 다른 구현으로 둔다. 화면에서 고를 수는 없고 `index.html`의 `<link>`를 바꿔야 쓴다. `test/ui-tokens.test.ts`가 세 파일을 모두 검사한다.

## 이유

- Astryx는 React 19와 StyleX 기반이다[^astryx]. taskq UI는 빌드 없이 정적 ES module로 돈다는 [결정](2026-11-no-build-typescript-static-ui.md)이 있어 컴포넌트를 들여오면 번들러와 React가 필요하다. Astryx도 테마를 CSS custom property 묶음으로 정의하므로, 토큰만 옮기면 기존 계약 안에서 바꿀 수 있다.
- 앱 CSP가 외부 리소스를 막으므로 Google Fonts의 Figtree를 불러오지 않았다.

## 잃는 것

- Astryx 컴포넌트의 모양(버튼 높이, 입력창 테두리, 표 패턴)은 따라오지 않는다. 컴포넌트 CSS는 기존 규칙을 그대로 쓰고 값만 바뀐다.
- Astryx neutral은 강조색이 흑백이라, 이전 테마의 주황 강조가 없어지고 선택 상태가 회색 면으로 보인다.
