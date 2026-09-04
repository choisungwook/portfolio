# akbun-pdf

오프라인에서 PDF를 읽고, 찾고, 주석과 페이지 편집을 수행하는 Tauri 데스크톱 앱.

## 현재 범위

- 상단 도구 모음, 페이지 썸네일, PDF 화면, 목차의 기본 레이아웃
- 빈 화면, 불러오는 중, 문서 열림, 오류 상태
- UI, Tauri adapter, 순수 Rust core, DTO contract 경계
- macOS, Windows, Linux 릴리스와 앱 내 자동 업데이트 골격

PDF 열기와 원본 보존 저장은 [Issue #1146](https://github.com/choisungwook/portfolio/issues/1146)에서 연결.

## 디렉터리

| 경로 | 역할 |
|---|---|
| [workspace/](./workspace/) | Vanilla TypeScript UI와 Tauri 앱 |
| [workspace/contracts/](./workspace/contracts/) | UI와 Rust의 명령·상태 DTO 스키마 |
| [workspace/src-tauri/crates/pdf-core/](./workspace/src-tauri/crates/pdf-core/) | Tauri에 의존하지 않는 PDF core |
| [wiki/](./wiki/) | 아키텍처와 개발·릴리스 절차 |
| [adr/](./adr/) | 제품 의사결정 |

## 실행

```bash
cd workspace
npm install
npm start
```

## 검증

```bash
npm run check
```
