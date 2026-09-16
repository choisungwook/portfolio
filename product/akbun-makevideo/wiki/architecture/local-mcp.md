# Local MCP

- Node MCP 서버: workspace/mcp/server.mjs
- 로컬 연결: workspace/mcp/bridge.mjs → ~/.akbun-makevideo/control.sock
- 앱 도구: src-tauri/src/mcp.rs
- 복구·상태 토큰·socket: src-tauri/crates/control

## 경계

- 공식 MCP SDK가 initialize, tools/list, tools/call, stdio 수명 처리
- 앱은 줄바꿈 구분 JSON 요청 하나당 응답 하나 반환
- 소켓 요청 직렬 처리, 최대 요청 16 MiB
- 연결 디렉터리 0700, socket 0600
- 동작 중인 소켓은 두 번째 앱이 탈취하지 않음
- TCP·HTTP·OAuth 없음
- 기본 지원 macOS, Windows transport 미구현

## 편집과 복구

- get_project: DocumentState와 프로젝트·revision 기반 stateToken 반환
- apply_edits: 최신 token 확인 → detached Document 검증 → checkpoint 원자적 저장 → 단일 Undo transaction
- 체크포인트 생성·검증·적용은 Document lock 안에서 처리
- 복구 지점: Tauri app data의 mcp-checkpoints/*.json
- restore_checkpoint: 현재 상태 보관 → 저장 프로젝트 검증 → Document 교체·revision 증가
- 복구 후 미저장 문서로 표시. 이전 파일에 암묵적으로 덮어쓰지 않음
- 저장 전 대상 파일도 프로젝트로 읽어 보관. 프로젝트가 아닌 기존 파일 덮어쓰기 거절
- 내보내기는 token 검사 시 캡처한 프로젝트로 실행. 진행 중 편집은 기존 render 결과의 edited 필드로 확인

## 화면 동기화

- mcp:changed: 최신 Document 재조회, 타임라인·미리보기 갱신
- mcp:opened: 경로·선택·미디어 캐시 초기화
- mcp:saved: 저장 경로·savedRevision 갱신
- 렌더 결과: 기존 render:done 이벤트를 보관해 render_status로 제공

## 실행·검증

- [클라이언트 연결](../../docs/01-mcp-setup.md)
- [Computer Use용 매뉴얼](../../ai-manal.md)
- node --test mcp/server.test.mjs: 공식 SDK client↔stdio↔로컬 socket 계약 검증
- cargo test -p makevideo-control: 스냅샷 영속성·저장 실패·원자적 편집·상태 토큰 검증

개발용 앱에서 실제 미디어·복구·출력을 확인하는 절차. 사용자 작업이 없는 별도 개발용 창에만 실행.

```bash
mkdir -m 700 -p /tmp/makevideo-mcp-dev
AKBUN_MAKEVIDEO_SOCKET=/tmp/makevideo-mcp-dev/control.sock npm start
```

다른 터미널에서 workspace를 기준으로 실행. 합성 영상과 결과는 임시 디렉터리에 보관하며 검사 후 원래 프로젝트 상태로 복구.

```bash
AKBUN_MAKEVIDEO_SOCKET=/tmp/makevideo-mcp-dev/control.sock node mcp/native-smoke.mjs
```
