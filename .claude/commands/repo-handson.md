---
description: 핸즈온 workspace를 만든다. 다정한 말투 docs + knowledge 번들 + 로컬 실행 환경
argument-hint: <workspace 경로> <주제>
---

핸즈온 workspace를 만든다. 대상 workspace는 `$1`(루트가 아닌 하위 디렉터리), 주제는 `$2` 이후 인자다. 인자가 없으면 대화 맥락에서 정한다.

## 순서

1. workspace 아래 `docs/` 디렉터리를 만들고 핸즈온 본문을 쓴다.
2. `templates/knowledge/`를 workspace로 복사한다.
3. workspace 루트에 `AGENTS.md`를 만든다.
4. 로컬 테스트 수단을 만든다.
5. VM이 필요하면 workspace 아래 `terraform/`에 리소스를 만든다.

## docs 규칙

- 파일명 앞에 순서를 붙인다. 예: `1-problem.md`, `2-handson.md`, `3-cleanup.md`
- `setup.md`를 따로 만들고 설치 관련 내용은 전부 여기에만 쓴다. 다른 문서는 설치가 필요할 때 `setup.md`를 링크한다.
- `setup.md`는 up과 down 두 스텝으로 끝낸다. up/down은 `docker compose up -d`, `docker compose down -v`처럼 한 줄 명령으로 만든다.
- 본문 말투는 `/akbun-writing:akbun-writing-style-warm` 스킬을 따른다. 독자는 이 주제를 처음 시작하는 사람이다.
- markdown 규칙은 [.claude/rules/markdown.md](../rules/markdown.md)를 따른다.

## knowledge 복사

`templates/knowledge/`를 통째로 workspace에 복사한다. workspace는 각각 독립이므로 자기 knowledge를 갖는다.

```bash
cp -R templates/knowledge "$1/knowledge"
```

복사한 index.md와 log.md의 자리 표시 예시 줄은 첫 concept를 쓸 때 실제 항목으로 바꾼다.

## AGENTS.md

workspace 루트에 `AGENTS.md`를 만들고 다음을 담는다.

- 이 핸즈온이 무엇인지 한 줄.
- `@../../AGENTS.md`(루트까지의 상대 경로) 링크. 글로벌 규칙은 여기를 따른다.
- knowledge 갱신 규칙. 아래 문단을 그대로 넣는다.

```markdown
## knowledge 갱신

이 workspace의 작업에서 얻은 지식은 `knowledge/`에 계속 반영한다. 추가만이 아니라 수정과 삭제까지 포함한다.

- 새로 알게 된 의사결정, 반복 절차, 도메인 통찰은 concept로 추가한다.
- 기존 concept와 어긋나는 사실을 알게 되면 그 concept를 고친다. 새 파일을 만들어 두 개를 남기지 않는다.
- 더 이상 맞지 않는 concept는 지운다. 틀린 기록을 남겨 두면 다음 작업이 그것을 믿는다.
- 추가·수정·삭제 뒤에는 해당 `index.md`와 `log.md`를 같은 commit에서 갱신한다.

작성 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.
```

## 로컬 테스트

- 기본은 docker compose. `compose.yaml`을 workspace 루트에 둔다.
- compose까지 필요 없으면 macOS 기준 CLI 명령으로 대체한다. (brew, 기본 유틸)

## VM이 필요할 때

- AWS EC2를 쓰고 기본은 arm 인스턴스(t4g.medium)로 한다. 사용자가 x86을 요청하면 t3.medium을 쓰고 AMI 아키텍처도 함께 바꾼다.
- terraform 작성 규칙은 [.claude/rules/terraform.md](../rules/terraform.md)를 따른다.

## 멈추는 지점

구현과 검증까지만 하고 commit, push, PR은 하지 않는다. 변경 요약을 보고하고 멈춘다.
