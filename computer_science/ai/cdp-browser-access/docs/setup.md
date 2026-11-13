# 실습 환경 준비

모든 시나리오는 macOS의 로컬 Chrome 하나와 정적 웹 서버 하나로 진행합니다. 실습용 Chrome은 평소 쓰는 Chrome과 프로필을 분리해 띄우므로, 로그인된 계정이나 열린 탭에는 영향을 주지 않습니다.

## 필요한 도구

| 도구 | 용도 | 확인 명령 |
|---|---|---|
| Google Chrome | CDP 서버 역할을 하는 브라우저 | `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version` |
| Python 3 | 테스트 페이지를 띄우는 정적 서버 | `python3 --version` |
| uv | PEP 723 스크립트 실행(의존성 자동 설치) | `uv --version` |

검증에 쓴 버전은 Chrome 157.0.8103.78, uv로 설치되는 `websockets` 15.0.1, `playwright` 1.55.0입니다. Playwright는 브라우저를 직접 띄우지 않고 이미 떠 있는 Chrome에 붙기 때문에 `playwright install`은 필요하지 않습니다.

## 환경 올리기

아래 명령은 저장소 루트에서 시작해 workspace로 이동한 뒤 테스트 페이지 서버(8000번 포트)와 CDP를 연 Chrome(9222번 포트)을 백그라운드로 띄웁니다. `--user-data-dir`로 실습 전용 프로필을 지정하는 이유는 [시나리오 1](1-cdp-principle.md#chrome-136의-보안-변경)에서 설명합니다.

```bash
cd computer_science/ai/cdp-browser-access
python3 -m http.server 8000 --bind 127.0.0.1 -d site >/dev/null 2>&1 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$PWD/.chrome-profile" --no-first-run --no-default-browser-check about:blank >/dev/null 2>&1 &
```

빈 탭 하나가 있는 새 Chrome 창이 뜨면 정상입니다. CDP 엔드포인트가 열렸는지는 다음 명령으로 확인합니다.

```bash
curl -s http://127.0.0.1:9222/json/version
```

`Browser`에 Chrome 버전이, `webSocketDebuggerUrl`에 `ws://127.0.0.1:9222/devtools/browser/<UUID>` 형태의 주소가 나오면 준비가 끝난 것입니다. UUID는 Chrome을 띄울 때마다 달라집니다.

## 환경 내리기

올릴 때와 같은 `computer_science/ai/cdp-browser-access`에서 실행합니다. 실습용 Chrome과 정적 서버를 종료하고 실습 프로필과 스크린샷을 지웁니다. `pkill -f` 패턴에 실습 프로필 경로가 들어가므로 평소 쓰는 Chrome은 종료되지 않습니다.

```bash
pkill -f "user-data-dir=$PWD/.chrome-profile"; pkill -f "http.server 8000"; rm -rf .chrome-profile cdp-raw-screenshot.png playwright-screenshot.png pw.err pw.out
```
