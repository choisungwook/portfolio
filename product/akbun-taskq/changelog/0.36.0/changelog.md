# akbun-taskq 0.36.0

## Added

- 모든 bot이 taskq 기본 skill을 갖는다. 자기가 taskq 안에서 돈다는 것, 지금 버전, 그 버전의 매뉴얼 위치, 워크플로 만드는 형식이 들어 있다. taskq가 시작할 때마다 실행 중인 버전으로 다시 쓰므로 업데이트하면 skill과 매뉴얼도 함께 새것이 된다.
- Plugins 메뉴 맨 위에 taskq 기본 skill이 보인다(버전, 작성 시각, SKILL.md 보기). 자동으로 갱신되고, 지우거나 고칠 수 없다.
- bot이 `create_workflow`와 `update_workflow`로 워크플로를 직접 만들고 고친다. `taskq_info`로 지금 버전과 매뉴얼 경로를 묻는다.
- `taskq manual [--search WORD]`가 지금 버전의 매뉴얼을 출력한다. API는 `GET /manual`, `GET /builtin-skill`.

## SDK

변화 없음. 기본 skill은 Claude bot에는 plugin skill로, OpenAI bot에는 `read_skill`로, Kiro bot에는 `skill://` resource로 기존 skill과 같은 길로 간다.
