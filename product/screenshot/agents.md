# Screenshot Desktop App - 개발 계획

## 목표

macOS/Windows 크로스플랫폼 스크린샷 캡처 데스크톱 앱 개발

## 기술 스택 선택

| 항목 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | **Tauri v2** | 크로스플랫폼(macOS, Windows, Linux), 경량, Rust 백엔드 |
| 프론트엔드 | **React + TypeScript** | 익숙한 웹 기술로 UI 구성 |
| 빌드 도구 | **Vite** | 빠른 개발 서버, HMR 지원 |
| 스크린샷 캡처 | **Tauri shell + OS 네이티브 명령** | macOS: `screencapture`, Windows: PowerShell |
| 이미지 편집 | **HTML5 Canvas API** | 브라우저 내장, 별도 라이브러리 불필요 |
| 클립보드 | **Tauri clipboard plugin** | 크로스플랫폼 클립보드 지원 |
| 파일 저장 | **Tauri dialog + fs plugin** | 네이티브 파일 저장 다이얼로그 |

## 핵심 기능

### Phase 1: 기본 스크린샷 (현재)
1. **전체 스크린샷** - 버튼 클릭 → 전체 화면 캡처
2. **범위 스크린샷** - 버튼 클릭 → 영역 선택 → 해당 영역만 캡처

### Phase 2: 캡처 후 액션
3. **Copy** - 캡처한 이미지를 클립보드에 복사
4. **Save** - 캡처한 이미지를 파일로 저장 (PNG)
5. **Edit** - 캡처한 이미지를 편집 화면으로 이동

### Phase 3: 이미지 편집
6. **사각형 강조** - 색상이 있는 테두리 직사각형으로 영역 강조
7. **자동 번호 매기기** - 숫자가 있는 원형 마커
8. **선 그리기** - 직선, 화살표
9. **텍스트 삽입** - 원하는 위치에 글씨 넣기

## 프로젝트 구조

```
product/screenshot/
├── agents.md              # 이 파일 (개발 계획)
├── explain.md             # 기술 설명 문서
├── src-tauri/             # Rust 백엔드
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs        # Tauri 진입점
│       └── lib.rs         # 스크린샷 캡처 로직
├── src/                   # React 프론트엔드
│   ├── App.tsx            # 메인 앱 컴포넌트
│   ├── App.css            # 스타일
│   ├── main.tsx           # React 진입점
│   ├── components/
│   │   ├── CaptureButtons.tsx   # 캡처 버튼 UI
│   │   ├── PreviewOverlay.tsx   # 캡처 후 미리보기 + 액션
│   │   └── ImageEditor.tsx      # 이미지 편집기
│   └── utils/
│       └── screenshot.ts        # 스크린샷 유틸리티
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 구현 순서

1. Tauri + React 프로젝트 초기화
2. 메인 화면 UI (전체 캡처, 범위 캡처 버튼)
3. OS 네이티브 명령으로 스크린샷 캡처 구현
4. 캡처 후 미리보기 오버레이 (Copy / Save / Edit 버튼)
5. Copy, Save 기능 구현
6. Canvas 기반 이미지 편집기 구현
7. 편집 도구 구현 (사각형, 번호, 선, 텍스트)

## 상태

- [x] 계획 수립
- [x] 프로젝트 초기화
- [x] 기본 스크린샷 기능
- [x] 캡처 후 액션 (Copy, Save, Edit)
- [x] 이미지 편집기
