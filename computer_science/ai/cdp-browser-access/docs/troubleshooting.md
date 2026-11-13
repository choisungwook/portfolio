# Troubleshooting

## uv run이 `No interpreter found at path` 오류로 실패

**증상**

`uv run cdp-raw/cdp_raw.py`가 스크립트를 실행하기 전에 다음 오류로 끝납니다.

```text
error: No interpreter found at path `3.12.1/envs/jwt`
```

**원인**

pyenv의 전역 버전 설정(`pyenv global`)이 지워진 virtualenv를 가리키고 있으면, uv가 그 값을 Python 버전 요청으로 읽어 존재하지 않는 경로를 찾습니다. 스크립트나 uv의 문제가 아니라 셸 환경의 Python 버전 설정 문제입니다.

**해결**

Python 버전을 명시해 pyenv 설정을 우회합니다. 근본적으로는 `pyenv global`을 존재하는 버전으로 바꿉니다.

```bash
uv run --python 3.12 cdp-raw/cdp_raw.py
```

## cdp_raw.py가 `Page.navigate` 뒤에서 멈춤

**증상**

이동 명령을 보낸 뒤 `Page.loadEventFired`를 기다리며 응답 없이 멈춥니다. 매번이 아니라 간헐적으로 발생합니다.

**원인**

CDP는 event와 명령 응답의 순서를 보장하지 않습니다. `Page.loadEventFired`가 `Page.navigate`의 응답보다 먼저 도착하면, 응답을 기다리던 루프가 그 event를 읽어 버리고 이후의 대기 루프는 다시 오지 않을 event를 기다립니다.

**해결**

명령 응답을 기다리는 동안 받은 event 이름을 `seen_events`에 쌓아 두고, event 대기 함수가 이 목록을 먼저 확인하게 합니다. 현재 `cdp_raw.py`는 이 방식으로 작성되어 있습니다.

## Claude CLI `--chrome`이 "Browser extension is not connected"를 보고

**증상**

`claude --chrome`에서 브라우저 tool을 호출하면 확장이 연결되지 않았다는 오류가 나옵니다. Chrome에는 Claude 확장이 설치되어 있습니다.

**원인**

Claude 확장 하나에 Claude desktop(`com.anthropic.claude_browser_extension`)과 Claude CLI(`com.anthropic.claude_code_browser_extension`)가 각자 Native Messaging host를 등록합니다. 확장이 desktop 쪽 host에 붙어 있으면 CLI의 host는 확장과 연결되지 못합니다. 등록 상태는 [시나리오 2의 작업 3](2-ai-tool-access-paths.md#3-native-messaging-host-등록-파일-확인)으로 확인합니다.

**해결**

Chrome과 Claude CLI를 모두 재시작한 뒤 CLI에서 `/chrome`으로 다시 연결합니다. 계속 실패하면 Claude desktop을 종료한 상태에서 다시 시도합니다.
