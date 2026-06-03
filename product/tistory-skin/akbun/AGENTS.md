# akbun tistory skin

이 프로젝트는 티스토리 블로그용 커스텀 스킨이다. 스킨 파일(`skin.html`, `style.css`, `index.xml`)을 수정하고, 로컬 preview 파일로 확인한 뒤, 티스토리 관리자에 업로드하는 흐름으로 작업한다.

## 문서 구조

| 문서 | 역할 |
| --- | --- |
| [`docs/tistory-rules.md`](./docs/tistory-rules.md) | 티스토리 파서의 블록 태그, 치환자, 페이지 유형 규칙 |
| [`docs/design.md`](./docs/design.md) | 레이아웃 비율, 색상, 타이포그래피 등 디자인 명세 |
| [`docs/validation.md`](./docs/validation.md) | 작업 후 검증 체크리스트 (HTML/CSS/JS 스냅샷 포함) |
| [`docs/deploy.md`](./docs/deploy.md) | 티스토리 관리자 업로드 절차 |

스킨 수정 전에 `docs/tistory-rules.md`와 `docs/design.md`를 먼저 읽어라 -- 티스토리 파서는 오류 메시지 없이 실패하므로 규칙을 모르면 디버깅이 불가능하다.

## 작업 완료 전 검증

작업을 마치면 종료 전에 [`docs/validation.md`](./docs/validation.md)를 기준으로 검증한다. preview 파일을 읽어서 확인할 수 있는 항목은 소스를 직접 확인하고, 브라우저에서만 확인 가능한 항목은 "수동 확인 필요"로 표시한다.

- UI나 구조가 바뀌었으면 `docs/validation.md`도 함께 갱신할지 사용자에게 확인한다 -- 검증 문서가 실제 스킨과 어긋나면 이후 작업에서 잘못된 기준으로 검증하게 된다.
- 검증 결과는 표 형식으로 정리해서 보여준다.

## 참고

- 티스토리 스킨 공식 문서: <https://tistory.github.io/document-tistory-skin/common/basic.html>
