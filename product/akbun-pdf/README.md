# akbun-pdf

PDF를 읽고, 찾고, 주석·페이지 편집과 Codex 기반 요약을 수행하는 Tauri 데스크톱 앱.

## 현재 범위

- PDF 열기·닫기, 변경 감지와 증분·원자적 저장
- 페이지 썸네일, 계층형 목차, 페이지 바로가기와 보기 맞춤
- 트랙패드 핀치와 cmd 휠로 커서 지점 기준 확대·축소
- 썸네일 끌기 재정렬, 페이지 삭제와 90도 회전
- 색을 고르고 드래그로 바로 긋는 형광펜과 표준 Highlight·Text 주석 편집
- 파일 순서와 페이지 수 미리보기를 제공하는 PDF 합치기
- 한글·영문 정규화 검색, 점진적 인덱싱과 단어 단위 강조
- 페이지 번호와 문맥을 나열하는 오른쪽 찾기 패널
- 현재·직접 지정·전체 페이지의 텍스트와 이미지를 사용하는 Codex AI 요약
- ChatGPT 인증, Luna·Terra·Sol 모델 선택과 JSONL 대화 저장
- 파일·편집·보기·도움말 데스크톱 메뉴와 앱 내 업데이트
- UI, Tauri adapter, 순수 Rust core, DTO contract 경계
- macOS, Windows, Linux 릴리스

## 디렉터리

| 경로 | 역할 |
|---|---|
| [workspace/](./workspace/) | Vanilla TypeScript UI와 Tauri 앱 |
| [workspace/contracts/](./workspace/contracts/) | UI와 Rust의 명령·상태 DTO 스키마 |
| [workspace/src-tauri/crates/pdf-core/](./workspace/src-tauri/crates/pdf-core/) | Tauri에 의존하지 않는 PDF core |
| [workspace/src-tauri/crates/pdf-ai/](./workspace/src-tauri/crates/pdf-ai/) | AI 설정·대화·임시 이미지 저장소 |
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
