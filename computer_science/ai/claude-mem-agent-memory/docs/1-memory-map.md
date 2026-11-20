# 시나리오 1. 오늘 놀이공원에 몇 명이 왔을까?

`attendance.txt`에는 방문객 수만 적습니다. 대화로 알려준 집계 기준과 확정 시각까지 새 세션이 기억하는지 확인합니다.

## 1. 방문객 수 기록

[환경 준비](setup.md)를 마친 터미널에서 아래를 실행합니다. 처음부터 다시 실습할 때는 새 폴더와 DB를 준비하세요.

```bash
PA='attendance.txt를 만들어 137 한 줄만 적어 줘. 방문객은 지금까지 137명이고, 직원은 집계에서 제외해. 최종 인원은 오후 6시에 확정할 거야.'
minimem/.venv/bin/python scripts/run_session.py --no-mcp --tools Write "$LAB_DIR/park" "$PA" &&
  cat "$LAB_DIR/park/attendance.txt"
```

## 2. 같은 질문으로 비교

먼저 minimem을 끄고 묻습니다. 둘 다 `--tools ""`를 사용해 파일 읽기를 막습니다.

```bash
PB='오늘 놀이공원 방문객은 몇 명이었어? 집계에서 누구를 뺐고 몇 시에 확정하기로 했어? 모르는 항목은 모른다고 답해 줘.'
minimem/.venv/bin/python scripts/run_session.py --no-memory --tools "" "$LAB_DIR/park" "$PB"
```

아래 명령으로 지난 세션 요약이 있는지 확인합니다. 아직 비어 있으면 몇 초 뒤 다시 확인하세요.

```bash
minimem/.venv/bin/minimem context park
```

이제 시작할 때 요약을 받도록 두고 같은 질문을 합니다.

```bash
minimem/.venv/bin/python scripts/run_session.py --no-mcp --tools "" "$LAB_DIR/park" "$PB"
```

| 옵션 | 시작 시 메모리 주입 | MCP 검색 |
| --- | --- | --- |
| `--no-memory` | 끔 | 끔 |
| `--no-mcp` | 켬 | 끔 |

첫 질문의 `injected_context_chars`는 0입니다. 두 번째가 **137명, 직원 제외, 오후 6시**를 답했다면 어디서 알았을까요? 첫 요청과 도구 기록을 hook이 캡처하고, observer가 SQLite에 요약을 저장한 뒤, `SessionStart`가 그 요약을 모델 입력에 붙였습니다. [캡처 기록 확인](2-capture-hooks.md)
