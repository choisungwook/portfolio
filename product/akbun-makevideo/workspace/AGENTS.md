# Workspace guide

- UI를 수정하기 전에 [designs](../designs/README.md)를 읽고 SVG와 token을 기준으로 삼는다.
- 구조나 동작 경계를 수정하기 전에 [ADR index](../adr/index.md)에서 관련 결정을 읽는다.
- `src/`는 build step 없는 HTML, CSS, JavaScript다.
- 페이지에서 검증할 수 있는 UI는 `src/`를 정적 서버로 열어 확인한다.
