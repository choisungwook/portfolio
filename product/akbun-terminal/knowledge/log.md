# Knowledge Update Log

## 2026-09-18

- **Creation**: [콘텐츠 확대와 주변 패널 크기 분리](decisions/2026-09-content-and-panel-zoom.md) 결정 기록

## 2026-09-16

- **Creation**: [숨긴 패널의 constraint는 살아 있으므로 헤더의 hugging을 명시한다](decisions/2026-09-hidden-panes-still-pull-on-the-header.md) 기록. v0.13.0 오른쪽 패널 헤더가 세로 가운데로 늘어나 파일 목록이 사라진 원인.

## 2026-09-13

- **Creation**: [Git 패널은 읽기만 하고 저장소를 바꾸지 않는다](decisions/2026-09-git-panel-reads-and-never-writes.md) 기록. commit 상세와 작업 트리 패널을 추가하면서 쓰기 동작을 넣지 않은 이유.

## 2026-09-11

- **Creation**: [.app은 번들이 아니라 실행파일에 서명한다](decisions/2026-09-app-bundle-is-signed-at-the-executable.md) 기록. v0.10.0부터 release job이 codesign에서 실패해 두 버전이 사용자에게 도달하지 못한 원인과 해결.
- **Creation**: [release 빌드만 깨지는 Swift 컴파일러 크래시는 표현을 바꿔 피한다](decisions/2026-09-release-build-crashes-on-some-swift-spellings.md) 기록. debug 빌드가 통과해도 release 빌드를 돌려야 하는 이유.

## 2026-08-21

- **Creation**: [렌더링은 LSP 없이 외부 엔진에 위임](decisions/2026-08-rendering-is-delegated-without-lsp.md) 결정 기록. 언어별 커스텀 렉서와 내부 HTML 실행을 제거하고 View/Edit 책임 경계를 남긴다.
