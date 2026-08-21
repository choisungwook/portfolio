---
type: Decision
title: 렌더링은 LSP 없이 외부 엔진에 위임
description: 구문 강조와 Markdown 표현은 외부 엔진에 맡기고 HTML 실행은 시스템 브라우저에 맡긴다.
tags: [macos, syntax-highlighting, markdown, webkit, security]
timestamp: 2026-08-21T00:00:00Z
---

## 결정

- LSP를 도입하지 않는다. LSP는 완성, 진단, 정의 이동 같은 언어 지능의 경계이며 구문 강조나 편집 UI의 대체재가 아니다.
- 소스 View는 HighlighterSwift가 감싼 Highlight.js 문법 정의를 사용한다.
- Markdown Preview는 번들된 markdown-it, Highlight.js, Mermaid를 비영구 WebKit 뷰에서 사용한다.
- Markdown의 raw HTML은 비활성화한다. 문서가 제공한 JavaScript는 실행하지 않는다.
- HTML 내부 Render 모드는 삭제한다. 독립 `Open in Browser` 액션으로 저장된 로컬 파일을 시스템 브라우저에 맡긴다.
- 문서는 View/Edit 두 모드만 가진다. Command E로 전환하고 현재 아이콘은 테마의 accent 색을 사용한다.
- 코어 프로토콜에서 `render_markdown`과 `highlight`를 제거하고 버전을 2로 올린다.

## 이유

- 언어별 커스텀 렉서는 중첩 문법과 새 언어를 계속 직접 유지해야 한다.
- LSP를 넣어도 문법 정의와 렌더러는 별도로 필요하다.
- Markdown은 범용 파서와 확장 생태계가 필요하지만, 문서 코드를 앱 권한으로 실행할 이유는 없다.
- HTML 실행은 브라우저의 격리와 사용자 보안 설정 안에서 수행하는 편이 책임 경계가 명확하다.

## Citations

1. VS Code Language Server Extension Guide: https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
2. VS Code Syntax Highlight Guide: https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide
3. HighlighterSwift: https://github.com/smittytone/HighlighterSwift
4. markdown-it: https://github.com/markdown-it/markdown-it
