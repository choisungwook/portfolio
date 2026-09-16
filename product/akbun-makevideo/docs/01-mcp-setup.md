# 로컬 MCP 연결

- 대상: macOS의 akbun-makevideo 0.45.0 이상, Codex 또는 Claude Desktop
- 연결: AI 클라이언트 → stdio MCP → 사용자 전용 Unix socket → 실행 중인 편집기
- 같은 서버·도구를 사용하며 클라이언트 설정 형식만 다름
- 별도 계정·토큰·로그인 없음. TCP 포트나 외부 서버 없음
- Windows named pipe 연결은 미지원

## 준비

- Node.js 22 이상 LTS, ffmpeg 설치
- 이 저장소를 내려받고 MCP 의존성 설치

```bash
cd /path/to/portfolio/product/akbun-makevideo/workspace/mcp
npm ci
command -v node
pwd
```

- 출력된 node 절대 경로와 MCP 디렉터리 경로를 아래 설정에 사용
- 편집기를 먼저 실행하고 작업할 프로젝트 열기
- 아직 해당 버전이 배포되지 않았다면 소스에서 개발용 앱 실행

```bash
cd /path/to/portfolio/product/akbun-makevideo/workspace
npm ci
npm start
```

- 개발 실행에는 Rust와 Xcode Command Line Tools 필요
- MCP 서버는 각 AI 앱이 자동 실행. 터미널에서 계속 켜 둘 필요 없음

## Codex

```bash
codex mcp add akbun-makevideo -- /absolute/path/to/node /absolute/path/to/workspace/mcp/server.mjs
codex mcp list
```

- Codex를 다시 열고 새 대화에서 도구 확인
- 오래 걸리는 프레임 추출을 위해 사용자 설정의 해당 항목에 시간 제한 지정

```toml
[mcp_servers.akbun-makevideo]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/workspace/mcp/server.mjs"]
tool_timeout_sec = 120
```

- 같은 이름으로 이미 등록했다면 기존 항목 수정. 중복 테이블 추가 금지
- 설정 위치: ~/.codex/config.toml

## Claude Desktop

- Settings → Developer → Edit Config
- macOS 설정 파일: ~/Library/Application Support/Claude/claude_desktop_config.json
- 기존 mcpServers 항목에 추가하고 Claude Desktop 재시작

```json
{
  "mcpServers": {
    "akbun-makevideo": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/workspace/mcp/server.mjs"]
    }
  }
}
```

- 기존 서버 설정은 유지
- 연결 자체에는 인증이 없지만 AI 클라이언트의 도구 실행 확인 정책은 별도 적용

## 연결 확인

AI에게 다음 문장을 전달.

> akbun-makevideo의 editing_guide를 읽고 get_project로 현재 프로젝트의 길이, 트랙, 미디어를 알려줘. 아직 편집하지 마.

- editing_guide는 앱이 닫혀 있어도 조회 가능
- get_project가 성공해야 실행 중인 앱과 연결된 상태
- 사용하는 모델은 해당 AI 앱에서 선택. MCP에서 Astra나 Claude 모델을 지정하지 않음

## 연결 오류

| 증상 | 확인 |
| --- | --- |
| 도구 자체가 없음 | node와 server.mjs 절대 경로, npm ci 실행, AI 앱 재시작 |
| Cannot reach akbun-makevideo | MCP 지원 버전 실행 여부, 같은 OS 사용자 여부 |
| 두 편집기 창 중 다른 창이 제어됨 | 기본 소켓은 먼저 연결한 앱 하나가 소유. 사용할 편집기만 실행 |
| Project changed | get_project 재조회 후 최신 stateToken으로 변경안 재계산 |
| ffmpeg 오류 | Settings → Preview & Tools의 ffmpeg 경로 확인 |
| 요청 시간 초과 | get_project 또는 render_status로 실제 완료 여부 확인 후 재시도 판단 |

- 기본 연결 파일: ~/.akbun-makevideo/control.sock
- 개발용 별도 연결: 앱과 MCP 프로세스 양쪽에 동일한 AKBUN_MAKEVIDEO_SOCKET 절대 경로 지정
- [편집과 복구 사용법](./02-mcp-editing.md)
- [Computer Use용 AI 매뉴얼](../ai-manal.md)

## 참고

- [Codex MCP 설정](https://developers.openai.com/codex/mcp)
- [Claude Desktop 로컬 MCP 연결](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
