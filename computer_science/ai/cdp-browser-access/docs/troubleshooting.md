# Troubleshooting

## uv run이 `No interpreter found at path` 오류로 실패

### uv 실행 증상

`uv run cdp-raw/cdp_raw.py`가 스크립트를 실행하기 전에 다음 오류로 끝납니다.

```text
error: No interpreter found at path `3.12.1/envs/jwt`
```

### uv 실행 원인

pyenv의 전역 버전 설정(`pyenv global`)이 지워진 virtualenv를 가리키고 있으면, uv가 그 값을 Python 버전 요청으로 읽어 존재하지 않는 경로를 찾습니다. 스크립트나 uv의 문제가 아니라 셸 환경의 Python 버전 설정 문제입니다.

### uv 실행 해결

Python 버전을 명시해 pyenv 설정을 우회합니다. 근본적으로는 `pyenv global`을 존재하는 버전으로 바꿉니다.

```bash
uv run --python 3.12 cdp-raw/cdp_raw.py
```

## cdp_raw.py가 `Page.navigate` 뒤에서 멈춤

### navigate 대기 증상

이동 명령을 보낸 뒤 `Page.loadEventFired`를 기다리며 응답 없이 멈춥니다. 매번이 아니라 간헐적으로 발생합니다.

### navigate 대기 원인

CDP는 event와 명령 응답의 순서를 보장하지 않습니다. `Page.loadEventFired`가 `Page.navigate`의 응답보다 먼저 도착하면, 응답을 기다리던 루프가 그 event를 읽어 버리고 이후의 대기 루프는 다시 오지 않을 event를 기다립니다.

### navigate 대기 해결

명령 응답을 기다리는 동안 받은 event 이름을 `seen_events`에 쌓아 두고, event 대기 함수가 이 목록을 먼저 확인하게 합니다. 현재 `cdp_raw.py`는 이 방식으로 작성되어 있습니다.

## Claude CLI `--chrome`이 "Browser extension is not connected"를 보고

### --chrome 연결 증상

`claude --chrome`에서 브라우저 tool을 호출하면 확장이 연결되지 않았다는 오류가 나옵니다. Chrome에는 Claude 확장이 설치되어 있습니다.

### --chrome 연결 원인

Claude 확장 하나에 Claude desktop(`com.anthropic.claude_browser_extension`)과 Claude CLI(`com.anthropic.claude_code_browser_extension`)가 각자 Native Messaging host를 등록합니다. 확장이 desktop 쪽 host에 붙어 있으면 CLI의 host는 확장과 연결되지 못합니다. 등록 상태는 [시나리오 2의 작업 3](2-ai-tool-access-paths.md#3-native-messaging-host-등록-파일-확인)으로 확인합니다.

### --chrome 연결 해결

Chrome과 Claude CLI를 모두 재시작한 뒤 CLI에서 `/chrome`으로 다시 연결합니다. 계속 실패하면 Claude desktop을 종료한 상태에서 다시 시도합니다.

## connect_over_cdp가 `Browser context management is not supported`로 실패

### 창 없는 Chrome 증상

`pw_over_cdp.py`가 연결 단계에서 다음 오류로 끝납니다. raw CDP 실습은 앞에서 잘 끝났고, `curl http://127.0.0.1:9222/json/version`도 정상으로 응답합니다.

```text
playwright._impl._errors.Error: BrowserType.connect_over_cdp: Protocol error (Browser.setDownloadBehavior): Browser context management is not supported.
```

### 창 없는 Chrome 원인

macOS의 Chrome은 창을 모두 닫아도 프로세스가 종료되지 않고 창 없이 떠 있습니다. 이 상태에서는 9222 포트가 열려 있어도 `/json/list`에 `page` target이 하나도 없습니다. Playwright는 연결 직후 기본 browser context를 설정하는 `Browser.setDownloadBehavior`를 보내는데, 열린 창이 없으면 Chrome이 이 명령을 거부합니다. 오류 문구는 context 기능을 말하지만 실제 원인은 열린 창이 없다는 것입니다.

### 창 없는 Chrome 해결

`/json/list`가 비어 있는지 확인합니다.

```bash
curl -s http://127.0.0.1:9222/json/list
```

`[  ]`처럼 빈 배열이 나오면 CDP의 HTTP 엔드포인트로 빈 탭을 하나 연 뒤 다시 실행합니다.

```bash
curl -s -X PUT "http://127.0.0.1:9222/json/new?about:blank"
```

## 환경 내리기 명령이 실습용 Chrome을 종료하지 못함

### 프로필 경로 증상

[setup.md](setup.md#환경-내리기)의 정리 명령을 실행해도 실습용 Chrome이 계속 떠 있고, `.chrome-profile`도 지워지지 않습니다.

### 프로필 경로 원인

실행 명령과 정리 명령은 모두 `$PWD/.chrome-profile`로 프로필 경로를 정합니다. Chrome을 띄울 때 `cd computer_science/ai/cdp-browser-access`를 건너뛰고 저장소 루트에서 실행하면, 프로필이 루트의 `.chrome-profile`에 만들어집니다. 이후 workspace에서 정리 명령을 실행하면 `pkill -f` 패턴의 경로가 달라서 그 Chrome을 찾지 못합니다.

### 프로필 경로 해결

실행 중인 실습용 Chrome의 실행 인자를 출력합니다. 경로에 공백이 있어도 잘리지 않도록 줄 전체를 봅니다.

```bash
ps -ax -o args= | grep -- '--remote-debugging-port=9222' | grep -v grep
```

출력의 `--user-data-dir=` 뒤 경로가 저장소 루트의 `.chrome-profile`이면, 저장소 루트에서 정리 명령의 Chrome 부분을 실행합니다.

```bash
pkill -f "user-data-dir=$PWD/.chrome-profile"; rm -rf .chrome-profile
```
