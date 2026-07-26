---
description: 핸즈온 workspace를 만든다. 학습지 HTML + 최소 docs + 로컬 실행 환경
argument-hint: <workspace 경로> <주제>
---

핸즈온 workspace를 만든다. 대상 workspace는 `$1`(루트가 아닌 하위 디렉터리), 주제는 `$2` 이후 인자다. 인자가 없으면 대화 맥락에서 정한다.

## 순서

1. `/akbun-learning:akbun-studysheet`로 주제의 실습 HTML 학습지를 만들어 workspace에 둔다.
2. workspace 아래 `docs/` 디렉터리를 만든다. HTML 학습지가 본문 역할을 하므로 md는 최소한만 쓴다.
3. 로컬 테스트 수단을 만든다.
4. VM이 필요하면 workspace 아래 `terraform/`에 리소스를 만든다.

## docs 규칙

- 파일명 앞에 순서를 붙인다. 예: `1-problem.md`, `2-handson.md`, `3-cleanup.md`
- `setup.md`를 따로 만들고 설치 관련 내용은 전부 여기에만 쓴다. 다른 문서는 설치가 필요할 때 `setup.md`를 링크한다.
- `setup.md`는 up과 down 두 스텝으로 끝낸다. up/down은 `docker compose up -d`, `docker compose down -v`처럼 한 줄 명령으로 만든다.
- 문서는 영어로 작성한다.
- 핸즈온 문서 본문은 `/akbun-writing:akbun-writing` 스킬의 스타일을 따른다.
- markdown 규칙은 [.claude/rules/markdown.md](../rules/markdown.md)를 따른다.

## 로컬 테스트

- 기본은 docker compose. `compose.yaml`을 workspace 루트에 둔다.
- compose까지 필요 없으면 macOS 기준 CLI 명령으로 대체한다. (brew, 기본 유틸)

## VM이 필요할 때

- AWS EC2를 쓰고 기본은 arm 인스턴스(t4g.medium)로 한다. 사용자가 x86을 요청하면 t3.medium을 쓰고 AMI 아키텍처도 함께 바꾼다.
- terraform 작성 규칙은 [.claude/rules/terraform.md](../rules/terraform.md)를 따른다.

## 멈추는 지점

구현과 검증까지만 하고 commit, push, PR은 하지 않는다. 변경 요약을 보고하고 멈춘다.
