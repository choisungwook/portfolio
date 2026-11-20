# 시나리오 1. 오늘 놀이공원에 몇 명이 왔을까?

오늘 오후 놀이공원에 방문객 137명이 왔습니다. 파일에는 숫자만 적고, **직원은 집계에서 제외한다**는 기준과 **오후 6시에 최종 인원을 확정한다**는 계획은 대화로만 알려 줍니다. 새 Claude Code 세션이 이 두 가지를 어떻게 알 수 있는지 확인합니다.

## 기록에서 답변까지

1. **캡처**: Claude Code가 첫 요청을 받으면 `UserPromptSubmit` hook이 요청을 저장합니다. `Write`로 파일을 만들면 `PostToolUse` hook이 도구 입력과 결과를 SQLite에 저장합니다.
2. **압축**: 응답이 끝나면 `Stop` hook이 별도의 Haiku 세션을 백그라운드에서 띄웁니다. 이 observer는 첫 요청과 도구 기록을 읽고, 요약과 관찰을 SQLite에 씁니다.
3. **주입**: 새 세션의 `SessionStart` hook이 최근 요약과 관찰 제목을 모델 입력에 붙입니다. 더 자세한 내용은 MCP로 검색하고 필요한 관찰만 읽을 수 있습니다.

관찰은 “직원은 방문객 집계에서 제외”처럼 따로 찾아볼 수 있는 사실이고, 요약은 그날 무슨 요청을 받고 무엇을 했는지 묶어 보여 줍니다.

## 실습

[환경 준비](setup.md)를 마친 같은 터미널에서 실행합니다. Claude Code는 세 번만 열고, 파일 작업은 첫 세션의 `Write` 한 번으로 끝냅니다. 첫 세션이 끝나면 observer가 별도로 한 번 실행됩니다.

세션 A부터 다시 실행할 때는 환경 준비의 전체 명령을 다시 실행해 새 폴더와 DB를 만드세요. `make up`만 다시 실행하면 이전 DB의 요약이 남아 이번 방문객 집계의 요약과 혼동될 수 있습니다.

### 1. 세션 A에서 방문객 숫자 기록

아래 지시로 `attendance.txt`를 작성합니다. 파일에 어떤 정보가 남을지 먼저 예상하고 확인하세요.

```bash
PA='놀이공원에 지금까지 방문객 137명이 왔어. Write로 attendance.txt를 만들어 숫자 137 한 줄만 적어 줘. 직원은 방문객 집계에서 제외하고, 오후 6시에 최종 인원을 확정할 거야. 기준과 시각은 파일에 적지 말고, 파일을 만들면 한 문장으로 답해 줘.'
minimem/.venv/bin/python scripts/run_session.py --no-mcp --tools Write "$LAB_DIR/park" "$PA" &&
  cat "$LAB_DIR/park/attendance.txt"
```

파일에서 `137`을, 세션 출력의 `tool_calls`에서 `Write`를 확인합니다. 직원 제외와 확정 시각은 observer가 읽을 첫 요청에 남습니다.

### 2. minimem을 끈 새 세션에 질문

observer가 뒤에서 일하는 동안, 새 세션에서 파일 접근을 끄고 세 가지를 묻습니다. 모르는 내용은 모른다고 답하도록 합니다.

```bash
PB='오늘 놀이공원 방문객은 몇 명이었어? 집계에서 누구를 뺐고 몇 시에 최종 인원을 확정하기로 했어? 이전 기록에 없는 항목은 모른다고 짧게 답해 줘.'
minimem/.venv/bin/python scripts/run_session.py --no-memory --tools "" "$LAB_DIR/park" "$PB"
```

`injected_context_chars`가 `0`인지 확인합니다. 파일을 읽을 수 있었다면 숫자는 알 수 있었겠지만, 직원 제외와 확정 시각은 파일만으로 알 수 없었을 겁니다.

### 3. minimem을 켠 새 세션에 같은 질문

observer가 쓴 요약을 확인한 뒤 다시 묻습니다. 아래는 요약과 인덱스가 올라올 때까지만 최대 약 45초간 기다립니다. 개인 Claude 설정이나 서비스 상태에 따라 전체 시간은 달라질 수 있습니다.

```bash
PARK_CONTEXT=
for attempt in {1..45}; do
  context="$(minimem/.venv/bin/minimem context park)" || break
  case "$context" in
    *"## 지난 세션 요약"*) PARK_CONTEXT="$context"; break ;;
  esac
  sleep 1
done

if [ -n "$PARK_CONTEXT" ]; then
  printf '%s\n' "$PARK_CONTEXT"
  minimem/.venv/bin/python scripts/run_session.py --no-mcp --tools "" "$LAB_DIR/park" "$PB"
else
  echo '아직 관찰을 저장하지 못했습니다. 문제 해결 문서에서 observer 항목을 확인하세요.'
fi
```

두 답변 모두 `tool_calls: 0`이 예상됩니다. 두 번째 질문 실행에서 `injected_context_chars`가 0보다 큰지, 답변에 **137명 / 직원 제외 / 오후 6시**가 들어 있는지 각각 확인하세요. 주입이 성공해도 observer의 요약에서 빠진 사실은 답변에서 누락될 수 있습니다.

`wall_s`는 명령을 실행하고 결과를 받기까지 걸린 시간이고, `duration_s`는 Claude Code가 보고한 세션 시간입니다. 이 실험은 메모리 주입의 효과를 비교합니다. 두 답변 세션이 모두 도구를 쓰지 않으므로 응답 속도 우열을 판단하려면 별도 측정이 필요합니다.

## 설명 연습

> `attendance.txt`에는 137만 적혀 있는데, 새 세션은 왜 직원 제외 기준도 알 수 있었을까요? 첫 요청부터 새 세션의 답변까지 누가 어떤 정보를 넘겼는지 설명해 보세요.

다음 장부터는 같은 실행에서 만들어진 기록을 들여다봅니다. [캡처부터 확인하기](2-capture-hooks.md)
