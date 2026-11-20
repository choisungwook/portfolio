# 시나리오 2. 캡처: lifecycle hook으로 도구 호출 모으기

메모리 파이프라인의 첫 번째 단계는 에이전트가 세션 동안 무엇을 했는지 빠짐없이 수집하는 일입니다. 이 시나리오에서는 Claude Code의 lifecycle hook과 `minimem/hook.py`가 도구 호출을 LLM 호출 없이 원본 그대로 SQLite에 기록하는 구조를 살펴봅니다. 시나리오 1에서 실행한 세션 A의 이벤트가 실제로 어떻게 저장되었는지 확인하고, hook 1회 실행에 걸리는 지연 시간(100 ms 이내)과 hook이 실패했을 때 세션이 안전하게 계속 도는지도 직접 측정해 봅니다.

## 캡처는 에이전트 판단과 무관하게 모든 활동을 받아 적는 단계

Claude Code hook은 세션의 특정 lifecycle 시점에 Claude Code 프로세스가 자동으로 실행하는 셸 명령입니다. 이벤트가 발생하면 Claude Code가 관련 정보를 JSON 형태로 명령의 stdin에 넘겨주고, `SessionStart`처럼 모델에게 돌려줄 내용이 있는 이벤트라면 stdout을 읽어 컨텍스트에 반영합니다.

`minimem`은 이 중 네 가지 이벤트를 사용합니다.

| 이벤트 | 발생 시점 | stdin 핵심 필드 | minimem 동작 |
| --- | --- | --- | --- |
| `SessionStart` | 새 세션 시작 | `session_id`, `cwd`, `source` | 지난 세션 요약과 관찰 인덱스를 출력해 컨텍스트에 주입 ([시나리오 5](5-context-injection.md)) |
| `UserPromptSubmit` | 사용자가 프롬프트를 전송할 때 | `prompt` | 세션의 첫 프롬프트와 `cwd`를 DB에 저장 |
| `PostToolUse` | 도구 호출이 성공적으로 끝난 직후 | `tool_name`, `tool_input`, `tool_response` | 도구 호출 이벤트 1건을 원본 그대로 저장 |
| `Stop` | 에이전트가 응답을 마칠 때 | `session_id` | observer를 별도 분리 프로세스로 백그라운드 실행 ([시나리오 3](3-observer.md)) |

물론 hook이 모든 것을 다 받는 것은 아닙니다. 모델의 내부 추론 과정이나 일반 응답 텍스트는 hook으로 전달되지 않습니다. 또한 권한이 거부되어 실패한 도구 호출은 `PostToolUse`가 아니라 `PostToolUseFailure` 이벤트로 빠지는데, `minimem`은 단순화를 위해 `PostToolUse`만 구독합니다. 반면 원본 `claude-mem`은 두 이벤트를 모두 받아 실패한 시도까지 기록합니다.

### 핵심 용어 정리

| 용어 | 의미 | 이 실습에서의 예 |
| --- | --- | --- |
| lifecycle 이벤트 | Claude Code 세션의 정해진 동작 시점 | `PostToolUse` |
| matcher | 어떤 도구 호출에 hook을 적용할지 지정하는 패턴 | `"matcher": "*"` (모든 도구 대상) |
| `additionalContext` | `SessionStart` hook이 stdout JSON으로 반환해 모델 입력에 추가하는 문자열 | 지난 세션 요약 및 인덱스 806자 |
| async hook | Claude Code가 종료를 기다리지 않고 비동기로 넘기는 hook | `claude-mem`의 `PostToolUse` (`"async": true`) |

## 왜 작업 에이전트에게 기록을 맡기지 않을까

흔히 떠올리는 방법은 프롬프트로 "중요한 발견이 있으면 메모 파일에 적어 두라"고 지시하는 것입니다. 하지만 이 방식은 기록 여부가 전적으로 작업 중인 모델의 판단에 좌우됩니다. 모델은 당장 눈앞의 버그를 고치는 데 집중할수록 메모를 건너뛰기 쉽고, 애초에 작업 도중에는 어떤 사실이 나중에 중요해질지 알기 어려운 경우도 많습니다.

시나리오 1에서 드러난 "`pytest`가 설치되어 있지 않다"는 사실이 딱 그런 사례입니다. 세션 A의 에이전트는 `python -m pytest`가 실패하자 별다른 메모를 남기지 않고 조용히 `unittest`로 우회해 버렸습니다. 그럼에도 다음 세션이 이 사실을 알 수 있었던 이유는, hook이 실패한 명령의 출력까지 기계적으로 이벤트에 남겨 두었고 observer가 나중에 그 기록에서 유용한 환경 정보를 건져 올렸기 때문입니다.

hook은 모델이 아니라 Claude Code 런타임 프로세스가 직접 호출하므로, 모델이 무엇을 생각하든 도구 호출이 하나도 빠지지 않고 기록됩니다.

## 캡처 방식별 대안 비교

| 방식 | 장점 | 단점 |
| --- | --- | --- |
| lifecycle hook (`claude-mem`, `minimem`) | 실시간으로 도구 호출 단위 캡처 가능, 에이전트 판단과 무관하게 누락 없음 | 동기 hook이 느리면 에이전트 응답 전체가 함께 느려짐 |
| transcript 파일 감시 | Claude Code hook 설정을 따로 건드리지 않아도 됨 | 파일 포맷이 공개 API가 아니라 버전업 시 깨질 수 있음 (`claude-mem`도 보조 수단으로만 사용) |
| 에이전트 자기 기록 (auto memory) | 별도 프로세스나 설정 없이 가볍게 동작 | 무엇을 남길지 모델 판단에 달려 있어 기록이 누락될 수 있음 |

## hook 안에서 LLM을 호출하지 않는 이유

`PostToolUse` hook은 에이전트가 도구를 한 번 쓸 때마다 매번 실행됩니다. 만약 동기(sync) hook 안에서 곧바로 LLM을 호출해 요약을 만들면, 도구 호출 1회마다 수 초의 지연이 그대로 사용자 대기 시간으로 누적됩니다.

그래서 `minimem`의 `on_tool`은 아주 단순한 일만 합니다. 받은 JSON을 적당한 길이로 자른 뒤 SQLite `events` 테이블에 `INSERT`하고 즉시 종료합니다. 시간이 오래 걸리는 LLM 요약 작업은 세션이 끝나는 `Stop` hook 시점에 별도 프로세스로 넘겨 백그라운드에서 처리합니다.

원본 `claude-mem`은 여기서 한 걸음 더 나아갑니다. `PostToolUse` hook 자체를 `"async": true`로 등록해 Claude Code가 기다리지 않게 만들고, hook은 이벤트를 로컬에서 상주하는 worker HTTP 서버로 전송합니다. 만약 worker가 죽어 있거나 응답하지 않으면 로컬 spool 파일에 임시로 적어 두고 끝납니다. `src/cli/handlers/observation.ts`의 주석을 보면 Codex의 hook timeout인 5초 안에 spool fallback까지 안전하게 마치기 위해 서버 대기 시간을 2초로 잡았다는 배경까지 확인할 수 있습니다.

## 주요 구성 요소와 역할

| 구성 요소 | 역할 |
| --- | --- |
| `.claude/settings.json`의 `hooks` | 각 lifecycle 이벤트에 실행할 셸 명령 등록 |
| `minimem-hook <이벤트>` | stdin의 JSON을 파싱해 `HANDLERS[이벤트]`로 라우팅 |
| `truncate()` | 도구 입력과 출력을 각각 2,000자로 제한해 대용량 `Read`가 DB와 observer 입력을 부풀리지 않도록 방지 |
| `should_skip()` | `mcp__minimem__*`, `ToolSearch` 같은 메모리 조회 도구 호출은 캡처 대상에서 제외 ([시나리오 6](6-mcp-search.md)) |
| `events` 테이블 | 도구 호출 원본과 observer 처리 여부(`processed` 플래그) 저장 |

## 도구 호출 캡처 흐름

에이전트가 도구를 한 번 호출했을 때 `events` 테이블에 행 하나가 쌓이기까지의 흐름입니다.

```mermaid
sequenceDiagram
  participant M as 모델
  participant CC as Claude Code
  participant H as minimem-hook tool
  participant DB as SQLite events
  M->>CC: tool_use Edit
  CC->>CC: Edit 실행
  CC->>H: stdin JSON (tool_name, tool_input, tool_response)
  H->>H: should_skip, truncate
  H->>DB: INSERT (processed=0)
  H-->>CC: exit 0 (약 40~80 ms)
  CC->>M: tool_result
```

## 실습: 저장된 이벤트와 hook 지연 측정

[시나리오 1](1-memory-map.md)의 3단계(`minimem`을 켜고 세션 A 실행)까지 완료된 상태에서 진행합니다. 모든 명령은 workspace 루트(`computer_science/ai/claude-mem-agent-memory`)에서 실행합니다.

### 1. 저장된 이벤트 목록 확인

세션 A 동안 발생한 도구 호출이 빠짐없이 기록되었는지 조회합니다. 출력의 `processed=1`은 observer가 이미 이 이벤트를 읽어 관찰로 압축했다는 표시입니다.

```bash
uv run --project minimem minimem events shop
```

실행하면 세션 A의 도구 호출 5건이 순서대로 출력됩니다.

```text
1  Bash  379 chars  processed=1  {"command": "ls -R . | head -50 && python -m pytest tests/te
2  Read  392 chars  processed=1  {"file_path": "/root/minimem-workspace/shop/shop/discount.py
3  Read  686 chars  processed=1  {"file_path": "/root/minimem-workspace/shop/tests/test_disco
4  Edit  894 chars  processed=1  {"file_path": "/root/minimem-workspace/shop/shop/discount.py
5  Bash  266 chars  processed=1  {"command": "python -m unittest tests.test_discount 2>&1 | t
```

시나리오 1에서 `run_session.py`가 집계했던 도구 호출 5회(`Bash` 2회, `Read` 2회, `Edit` 1회)가 정확히 5개 행으로 남았습니다. 특히 1번 `Bash` 이벤트 출력에 들어 있던 `No module named pytest`가 나중에 시나리오 3에서 관찰 `#2`로 태어나게 됩니다.

### 2. 이벤트 원본 1건 들여다보기

실제 DB에 저장된 `Edit` 이벤트(4번 행)의 입력과 출력 앞부분을 꺼내 보면, hook이 얼마나 날것의 데이터를 받는지 실감할 수 있습니다.

```bash
python3 -c "import sqlite3,os;c=sqlite3.connect(os.path.expanduser('~/.minimem/memory.db'));print(c.execute('select tool_input, substr(tool_output,1,200) from events where id=4').fetchone())"
```

출력 결과를 보면 수정된 코드 한 줄 외에 절대 경로, 중복된 JSON 키, 심지어 수정 전 파일 전체(`originalFile`)까지 그대로 담겨 있습니다.

```text
('{"file_path": "/root/minimem-workspace/shop/shop/discount.py", "old_string": "  return price - price * rate", "new_string": "  return price - price * rate // 100", "replace_all": false}', '{"filePath": "/root/minimem-workspace/shop/shop/discount.py", "oldString": "  return price - price * rate", "newString": "  return price - price * rate // 100", "originalFile": "\\"\\"\\"할인 계산.\\"\\"\\"\\n\\n')
```

다음 세션에 필요한 핵심은 "할인율 계산에서 100 나눗셈을 추가했다"는 사실 하나인데, 원본 데이터에는 불필요한 잡음이 훨씬 많습니다. 바로 이 점 때문에 원본을 그대로 주입하지 않고 observer로 한 번 압축하는 단계가 필요합니다.

### 3. hook 실행 시간 측정

동기 hook이 에이전트 속도에 얼마나 영향을 주는지 확인하기 위해 `hook_latency.py`로 hook을 10회씩 반복 측정합니다. 임시 `MINIMEM_HOME`을 사용하므로 기존 실습 DB는 건드리지 않습니다.

```bash
uv run scripts/hook_latency.py
```

측정 결과는 다음과 같습니다.

```text
PostToolUse, uv run 경유: median 80 ms, max 94 ms
PostToolUse, venv 직접 실행: median 39 ms, max 52 ms
Stop, observer 분리 실행: median 43 ms, max 45 ms
```

흥미로운 지점은 `uv run`을 거쳤을 때(80 ms)와 가상환경의 바이너리를 직접 실행했을 때(39 ms)의 차이입니다. 전체 소요 시간의 절반 가까이가 `uv run`의 가상환경 확인에 쓰이고 있었습니다. 도구 호출이 수십 번 이어지는 긴 세션이라면 이 차이가 수 초로 쌓이기 때문에, 실전 환경에서는 venv의 `minimem-hook`을 직접 호출하거나 `claude-mem`처럼 async hook을 쓰는 편이 낫습니다. 한편 `Stop` hook은 observer 프로세스만 띄우고 기다리지 않으므로, observer가 실제로 10초 가까이 돌더라도 hook 자체는 43 ms 만에 끝납니다.

### 4. hook 실패 시 세션 안전성 확인

메모리 기록은 어디까지나 보조 기능입니다. hook 내부에서 예외가 터졌다고 해서 사용자의 코딩 세션까지 멈춰서는 안 됩니다. 일부러 깨진 JSON을 stdin으로 넘겨 종료 코드를 확인해 봅니다.

```bash
echo 'not json' | minimem/.venv/bin/minimem-hook tool; echo "exit=$?"
```

에러 메시지는 stderr로 출력되지만, 종료 코드는 `0`으로 반환됩니다.

```text
minimem hook error: Expecting value: line 1 column 1 (char 0)
exit=0
```

Claude Code hook 규약에서 `exit 2`는 "이 작업을 차단하라"는 신호로 해석됩니다. 만약 메모리 저장 중 DB 잠금이나 파싱 오류가 났을 때 `exit 2`나 처리되지 않은 예외로 빠져나가면 에이전트 작업 흐름이 깨집니다. 그래서 `minimem`의 `main()`은 모든 예외를 잡아 stderr에 남기고 항상 `exit 0`으로 끝나도록 방어하며, `claude-mem`의 handler 주석 역시 "never exit 2"를 명시적인 규칙으로 두고 있습니다.

## 실무 관점에서 짚어볼 점

- **hook의 오버헤드는 대부분 코드가 아니라 실행기 기동 비용입니다**: 측정해 보면 SQLite `INSERT` 자체는 몇 밀리초에 불과하고, 인터프리터 기동과 패키지 매니저 확인이 지연의 대부분을 차지합니다. `claude-mem`이 PATH에 전용 launcher를 설치해 셸 없이 hook을 띄우는 것도 이 비용을 줄이기 위함입니다.
- **실패한 도구 호출도 훌륭한 기억 소재입니다**: 권한 거부나 명령 실패는 `PostToolUseFailure`로 전달됩니다. "이 명령은 승인이 필요하다"거나 "이 테스트 러너는 안 된다" 같은 실패 경험이 다음 세션의 시행착오를 크게 줄여주므로, 운영 수준에서는 성공과 실패 이벤트를 모두 수집하는 편이 유리합니다.
- **원본 이벤트에는 민감 정보가 섞일 수 있습니다**: 파일 전문과 셸 출력이 그대로 저장되므로 API 키나 환경 변수 값이 DB로 흘러들어갈 위험이 있습니다. `minimem`에는 빠져 있지만, `claude-mem`은 `<private>` 태그 제거(`src/utils/tag-stripping.ts`)와 민감정보 마스킹(`src/utils/redaction.ts`) 단계를 캡처 앞단에 두고 있습니다.
