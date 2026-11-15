# Troubleshooting

## `uv run` 실행 시 `No interpreter found at path` 오류

### uv 실행 증상

`uv run cdp-raw/cdp_raw.py` 명령이 스크립트를 실행하기 전에 다음 오류를 출력하며 종료됩니다.

```text
error: No interpreter found at path `3.12.1/envs/jwt`
```

### uv 실행 원인

`pyenv`의 전역 버전 설정(`pyenv global`)이 이미 삭제된 virtualenv를 가리키고 있으면, `uv`가 해당 값을 Python 버전 지정으로 해석해 존재하지 않는 경로를 탐색합니다. 스크립트나 `uv` 자체의 결함이 아니라 셸 환경의 Python 버전 설정 문제입니다.

### uv 실행 해결

실행 시 `--python` 옵션으로 Python 버전을 명시해 `pyenv` 설정을 우회합니다. 근본적으로는 `pyenv global`을 현재 유효한 Python 버전으로 재설정해야 합니다.

```bash
uv run --python 3.12 cdp-raw/cdp_raw.py
```

## `cdp_raw.py` 실행 시 `Page.navigate` 이후 무한 대기 현상

### navigate 대기 증상

페이지 이동 명령을 전송한 뒤 `Page.loadEventFired`를 대기하는 구간에서 응답 없이 간헐적으로 멈춥니다.

### navigate 대기 원인

CDP는 event와 명령 응답(response) 간의 도착 순서를 보장하지 않습니다. `Page.loadEventFired` event가 `Page.navigate` 명령의 응답보다 먼저 도착하면, 명령 응답을 기다리던 수신 루프가 해당 event를 소비해 버리고 이후의 event 대기 루프는 이미 지나간 event를 무한정 기다리게 됩니다.

### navigate 대기 해결

명령 응답을 기다리는 동안 수신된 event 이름을 `seen_events` 목록에 누적해 두고, event 대기 함수가 소켓을 읽기 전에 이 목록을 먼저 확인하도록 구현합니다. 현재 저장소의 `cdp_raw.py`에는 이 방식이 반영되어 있습니다.

## Claude CLI `--chrome` 실행 시 확장 미연결 오류

### --chrome 연결 증상

`claude --chrome`으로 실행한 세션에서 브라우저 tool을 호출할 때 Chrome 확장이 연결되어 있지 않다는 오류("Browser extension is not connected")가 발생합니다.

### --chrome 연결 원인

하나의 Claude 확장에 대해 Claude desktop(`com.anthropic.claude_browser_extension`)과 Claude CLI(`com.anthropic.claude_code_browser_extension`)가 각각 별도의 Native Messaging host를 등록합니다. 확장이 desktop 측 host에 연결된 상태라면 CLI 측 host는 확장과 통신할 수 없습니다. 현재 등록된 host 상태는 [시나리오 2의 3단계](2-ai-tool-access-paths.md#3-native-messaging-host-등록-파일-확인)에서 확인할 수 있습니다.

### --chrome 연결 해결

Chrome과 Claude CLI를 모두 재시작한 뒤 CLI에서 `/chrome` 명령으로 재연결을 시도합니다. 동일한 현상이 반복되면 Claude desktop 앱을 완전히 종료한 상태에서 다시 시도합니다.

## `connect_over_cdp` 호출 시 `Browser context management is not supported` 오류

### 창 없는 Chrome 증상

raw CDP 실습과 `curl http://127.0.0.1:9222/json/version` 확인까지는 정상 동작하지만, `pw_over_cdp.py` 실행 시 연결 단계에서 다음 오류로 실패합니다.

```text
playwright._impl._errors.Error: BrowserType.connect_over_cdp: Protocol error (Browser.setDownloadBehavior): Browser context management is not supported.
```

### 창 없는 Chrome 원인

macOS의 Chrome은 열린 창을 모두 닫아도 백그라운드 프로세스가 종료되지 않고 유지됩니다. 이 상태에서는 9222번 포트가 열려 있더라도 `/json/list`에 `page` target이 하나도 존재하지 않습니다. Playwright는 연결 직후 기본 browser context를 구성하기 위해 `Browser.setDownloadBehavior` 명령을 전송하는데, 열린 창이 없으면 Chrome이 이 명령을 거부합니다. 오류 메시지는 context 기능 미지원을 가리키지만 실제 원인은 활성화된 창이 없다는 점입니다.

### 창 없는 Chrome 해결

먼저 `/json/list`가 빈 배열을 반환하는지 확인합니다.

```bash
curl -s http://127.0.0.1:9222/json/list
```

`[  ]`처럼 빈 배열이 출력되면 CDP의 HTTP 엔드포인트로 새 빈 탭을 하나 생성한 뒤 스크립트를 다시 실행합니다.

```bash
curl -s -X PUT "http://127.0.0.1:9222/json/new?about:blank"
```

## 실습 환경 종료 명령 실행 후 Chrome 프로세스 잔류 문제

### 프로필 경로 증상

[setup.md](setup.md#실습-환경-종료-및-정리)의 종료 명령을 실행해도 실습용 Chrome 프로세스가 종료되지 않고 `.chrome-profile` 디렉터리도 삭제되지 않습니다.

### 프로필 경로 원인

실행 명령과 종료 명령 모두 `$PWD/.chrome-profile`을 기준으로 프로필 경로를 지정합니다. Chrome을 기동할 때 `cd computer_science/ai/cdp-browser-access`를 건너뛰고 저장소 루트에서 실행하면 프로필이 루트 디렉터리의 `.chrome-profile`에 생성됩니다. 이후 `cdp-browser-access` 디렉터리에서 종료 명령을 실행하면 `pkill -f` 패턴의 경로가 일치하지 않아 해당 Chrome 프로세스를 찾지 못합니다.

### 프로필 경로 해결

현재 실행 중인 실습용 Chrome의 전체 실행 인자를 조회해 `--user-data-dir=` 경로를 확인합니다. 경로가 잘리지 않도록 전체 인자를 출력합니다.

```bash
ps -ax -o args= | grep -- '--remote-debugging-port=9222' | grep -v grep
```

출력된 `--user-data-dir=` 경로가 저장소 루트의 `.chrome-profile`로 확인되면, 저장소 루트 디렉터리로 이동한 뒤 Chrome 프로세스 종료 및 프로필 삭제 명령을 실행합니다.

```bash
pkill -f "user-data-dir=$PWD/.chrome-profile"; rm -rf .chrome-profile
```
