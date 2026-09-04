# Development

## 준비와 실행

```bash
cd workspace
npm install
npm start
```

- Node.js 24 LTS
- Rust stable
- Linux는 Tauri 2의 WebKitGTK 시스템 패키지 필요

브라우저 UI만 실행:

```bash
npm run dev
```

## 화면 상태 확인

| URL | 상태 |
|---|---|
| `http://127.0.0.1:1420/?state=empty` | 빈 화면 |
| `http://127.0.0.1:1420/?state=loading` | 불러오는 중 |
| `http://127.0.0.1:1420/?state=ready` | 문서 열림 |
| `http://127.0.0.1:1420/?state=error` | 오류 |

## 검증

```bash
npm run check
```

- Vitest: 문서 상태 전이와 범위
- Vite build: TypeScript와 UI bundle
- Cargo: Tauri 없이 `pdf-core`만 테스트
- source size: 자체 작성 코드 파일 1,000줄 미만

## 자동 업데이트

- 공개 키: `src-tauri/tauri.conf.json`
- 개인 키 백업: `~/.tauri/akbun-pdf.key`
- GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY_PDF`
- 비밀번호 Secret: `TAURI_SIGNING_PRIVATE_KEY_PDF_PASSWORD`
- 고정 manifest tag: `akbun-pdf-updater`
- 개인 키 분실 시 설치된 앱을 새 키로 업데이트할 수 없음

로컬 검증에서는 `npm run dist`와 서명 명령을 실행하지 않음.
