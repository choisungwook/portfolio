# UI 시안과 실제 앱의 경계

## 시안의 역할

- [HTML 시안](../design-proposal/README.md)은 편집 흐름을 검토하는 별도 화면.
- 원본 HTML의 CSS·JS 경로를 기존 앱 소스로 연결하고 시안 스타일과 문구를 추가.
- 파일 저장·내보내기·AI 생성은 데스크톱 앱 기능이며 브라우저 시안의 검증 범위에서 제외.
- 시안의 편집 내용은 메모리에만 유지. 새로고침 시 예제 문서로 초기화.
- 근거: [build-proposal.mjs](../design-proposal/build-proposal.mjs), build-proposal.mjs:4.

## 화면 언어와 문서 언어

- 기본 화면 언어는 영어. 한국어 선택은 같은 브라우저에 저장.
- 메뉴를 번역해도 슬라이드 본문·문서 이름·입력값은 원문 유지.
- 새 도구나 안내가 추가되면 번역 리소스도 함께 보완해야 함.
- 근거: [i18n.js](../design-proposal/i18n.js), i18n.js:4 및 [언어 결정](../knowledge/decisions/2026-09-proposal-ui-language.md).

## 적용 전 판단

- 실제 앱의 HTML이 바뀌면 시안을 재생성하고 편집·언어 전환을 다시 확인.
- 생성 결과에 필수 UI·스타일·스크립트가 없으면 기존 HTML을 덮어쓰기 전에 실패.
- 네이티브 메뉴·대화상자의 번역은 브라우저 문구 전환만으로 검증할 수 없음.
- [시각 중심 결정](../knowledge/decisions/2026-09-proposal-keeps-slide-focus.md)과 [검증 범위](../design-proposal/verification.md)를 함께 확인.

## 확인 질문

1. 시안에서 파일 저장을 검증할 수 없는 이유는 무엇인가?
2. 화면 언어를 바꿔도 슬라이드 본문을 유지해야 하는 이유는 무엇인가?
3. 앱 HTML에 도구가 추가되면 시안에서 무엇을 다시 확인해야 하는가?
