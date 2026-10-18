---
description: 새 핸즈온 workspace를 만든다. 기존 핸즈온을 고칠 때는 쓰지 않는다
argument-hint: <workspace 경로> <주제>
---

핸즈온 workspace를 만든다. 대상 workspace(루트가 아닌 하위 디렉터리)와 주제는 `$ARGUMENTS` 전체에서 정하고, 인자가 없으면 대화 맥락에서 정한다. 인자는 자유 문장으로 오는 경우가 많아 위치 인자로 나누면 문장 조각이 경로가 된다.

- 인자에 `/`가 들어간 경로가 있으면 그것을 workspace로 쓰고, 없으면 인자 전체를 주제로 보고 경로를 정한다.
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
- 작업 디렉터리에 의존하는 명령(`-chdir`, 상대 경로)이 있으면 첫 코드블록에 `cd <workspace 경로>`를 넣는다. 위치를 산문으로만 적으면 독자는 명령만 복사해 다른 디렉터리에서 실행한다.
- markdown 규칙은 [.claude/rules/markdown.md](../rules/markdown.md)를 따른다.

## 실습 절차 문서 형식

실습 절차 문서(`2-handson.md` 등)는 목표 단위로 나누고, 목표마다 번호 순서로 쓴다. 독자는 콘솔이나 터미널을 옆에 띄우고 한 줄씩 따라 하므로, 지금 몇 번째 단계인지와 그 단계에서 무엇을 보면 되는지가 바로 보여야 한다. 원리 설명은 개념 문서로 보내고 여기에는 링크만 둔다.

- 목표는 H2로 `## [목표 N] <확인할 것> (<예상 시간>)` 형식으로 쓴다. 준비 확인은 `[목표 0]`, 리소스 정리는 마지막 목표로 둔다.
- 단계는 `1.`, `2.`, `3.` 번호 목록으로 쓰고, 한 단계에 행동 하나만 담는다. 콘솔 경로와 버튼은 굵게 쓴다. 예: **ECS > Clusters > cb-lab**, **Update**
- 그 단계에서 볼 결과(상태 값, 메시지, 걸리는 시간)는 그 단계 아래 하위 bullet로 붙인다. "확인할 것" 절을 따로 모으지 않는다.
- 콘솔 대신 CLI로도 할 수 있는 단계는 번호 목록 뒤에 "N단계에서 ~하면 아래 명령으로 대신합니다" 한 줄과 코드블록을 둔다.
- 실측값이 있으면 예상 시간과 결과에 실측값을 쓴다.

목표 하나의 형식:

```markdown
## [목표 1] 이미지 pull 실패로 FAILED와 롤백 보기 (약 8분)

1. 서비스 화면에서 **Update**를 누릅니다.
2. **Task definition**의 revision을 `2`로 바꾸고 **Update**를 누릅니다.
3. **Tasks** 탭에서 필터를 **Stopped**로 바꿉니다.
   - 1분 30초쯤 뒤 태스크가 `CannotPullContainerError`로 멈춥니다.
4. **Deployments** 탭에서 배포가 `FAILED`가 되고 롤백되는지 확인합니다.
```

## knowledge 복사

`templates/knowledge/`를 통째로 workspace에 복사한다. workspace는 각각 독립이므로 자기 knowledge를 갖는다.

```bash
cp -R templates/knowledge "<workspace>/knowledge"
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

## VM이 필요할 때

- AWS EC2를 쓰고 기본은 arm 인스턴스(t4g.medium)로 한다. 사용자가 x86을 요청하면 t3.medium을 쓰고 AMI 아키텍처도 함께 바꾼다.
- terraform 작성 규칙은 [.claude/rule-details/terraform.md](../rule-details/terraform.md)를 따른다.

## 멈추는 지점

구현과 검증까지만 하고 commit, push, PR은 하지 않는다. 변경 요약을 보고하고 멈춘다.
