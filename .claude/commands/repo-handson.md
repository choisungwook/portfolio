---
description: 새 핸즈온 workspace를 만든다. 기존 핸즈온을 고칠 때는 쓰지 않는다
argument-hint: <workspace 경로> <주제>
---

핸즈온 workspace를 만든다. 대상 workspace는 `$1`(루트가 아닌 하위 디렉터리), 주제는 `$2` 이후 인자다. 인자가 없으면 대화 맥락에서 정한다.

- `$1`에 `/`가 없으면 경로가 아니라 주제 문장의 첫 단어다. 인자 전체를 주제로 보고 경로는 대화 맥락에서 정한다.
- 경로는 기존 구조를 따른다. AWS 서비스 중심이면 `aws/<서비스>/<주제>`, AI·일반 주제면 `computer_science/<분야>/<주제>`다.

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
- 본문은 `/akbun-writing:akbun-writing` 스킬로 쓴다. 독자는 실무 엔지니어다. 스킬이 없는 환경이면 [philosophy.md](../rules/philosophy.md)와 루트 AGENTS.md의 문서 작성 규칙으로 쓰고 결과 보고에 남긴다.
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
- knowledge 포인터. 아래 문단을 그대로 넣는다. 읽고 쓰는 규칙은 루트 규칙에 이미 있으므로 여기서 반복하지 않는다.

```markdown
## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.
```

## 로컬 테스트

- 기본은 docker compose. `compose.yaml`을 workspace 루트에 둔다.
- compose까지 필요 없으면 macOS 기준 CLI 명령으로 대체한다. (brew, 기본 유틸)

## 이미지를 받을 수 없는 환경

네트워크 정책으로 docker image pull이 막히면 compose를 띄우지 못한다. 이때 compose가 쓰는 설정 파일을 그대로 두고 같은 버전의 프로그램을 PyPI나 GitHub release 바이너리로 직접 띄워 검증한다.

- compose 서비스 이름은 `/etc/hosts`에 loopback 주소(127.0.2.x)로 적어 흉내 낸다. replica 여러 개는 같은 이름에 주소를 여러 줄 적는다.
- compose 자체를 띄우지 못했다는 사실은 workspace AGENTS.md의 검증 상태에 남긴다.

## VM이 필요할 때

- AWS EC2를 쓰고 기본은 arm 인스턴스(t4g.medium)로 한다. 사용자가 x86을 요청하면 t3.medium을 쓰고 AMI 아키텍처도 함께 바꾼다.
- terraform 작성 규칙은 [.claude/rule-details/terraform.md](../rule-details/terraform.md)를 따른다.

## 멈추는 지점

구현과 검증까지만 하고 commit, push, PR은 하지 않는다. 변경 요약을 보고하고 멈춘다.
