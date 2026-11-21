# akbun-taskq 0.24.0

## Changed

- 설정 > 폴더의 세션 대화 기록을 런타임별로 나눠 보인다. Claude Code(task와 Claude bot, 사용자의 Claude Code와 같은 `~/.claude/projects`), Codex(ChatGPT 요금제 OpenAI bot, `~/.codex/sessions`), Kiro(kiro-cli 데이터 폴더)를 각각 경로와 열기 버튼으로 보이고, 아직 없는 폴더는 아직 없음으로 표시한다. API key·Bedrock OpenAI bot이 대화를 어디에 두는지도 적는다.
- bot 메뉴의 세션 폴더 열기가 그 bot의 런타임에 맞는 곳을 연다. Codex와 Kiro bot은 각 CLI의 기록 폴더, Bedrock OpenAI bot은 `team/<bot>/`을 열고, API key OpenAI bot은 로컬 기록이 없다고 알린다. `POST /api/open-folder`의 `sessions`는 `runtime`(claude, codex, kiro)을 받는다.
- 설정 창이 창 가장자리만 남기고 화면을 채운다. 왼쪽 메뉴는 고정되고 오른쪽 페이지만 스크롤되며, 페이지 안의 제목·설명·목록·버튼 사이에 일정한 간격을 둔다.
- 사이드바 BOTS 머리글은 정상 상태의 "동작 중"을 보이지 않고, 버튼을 "전체 멈추기"와 "전체 다시 켜기"로 부른다.

## Fixed

- 체크박스가 텍스트 입력칸 스타일(높이 32px, 여백, 배경)을 받아 작게 보이고 label보다 위로 떠 있던 문제.
- 설정 > 업데이트에서 릴리스 노트 링크와 설치 버튼이 붙어 있고 다시 확인 버튼이 들여쓰여 있던 문제. 세 동작을 한 줄에 간격을 두고 놓는다.
- 설정 > 폴더에서 열기 버튼과 아직 없음 표시가 두 줄로 꺾이던 문제.

## Removed

- 설정의 Access skills 메뉴. 새 작업 화면에서 access skill을 고를 수 없어 화면에서 등록해도 쓸 곳이 없었다. CLI(`taskq skills add`, `--access-skill`)와 API는 그대로다.

## SDK

변경 없음.
