# Astra 영상 편집과 단계별 검토 UI

- Issue: #1269
- Branch: feat/makevideo-astra-editing

## 실행 계획

- [x] 1. 참고 영상 자막과 UI, 기존 AI 및 편집 모델 조사
- [x] 2. 적용 범위 확정과 Astra 편집 제안·검증·적용 연결
- [x] 3. 편집 단계와 변경 검토 UI 구현
- [x] 4. 테스트·내장 브라우저 검증과 문서·버전 갱신
- [ ] 5. repo-pr-ship으로 Issue·PR·Copilot 리뷰·merge 진행

## 다음 세션이 알아야 할 것

- 참고 영상: https://www.youtube.com/watch?v=mePPNdZ9lP0
- 기존 Codex App Server 연결은 ChatGPT 로그인과 제한된 ephemeral thread 사용
- 기존 대화는 편집 불가, 전사·무음 제거는 별도 작업으로 이미 구현됨
- Rust Document의 transaction과 revision을 사용해 편집 제안을 원자적으로 적용할 계획
- 사용자 확정: 전체 흐름, B-roll 시각 분석과 재사용 그래픽 라이브러리 포함
- Node 204개, Rust edit 77개 통과, cargo check 통과
- 실제 Astra 편집 명령·image input 확인, Rust fixture로 undo/redo 확인
- 내장 브라우저에서 fixture 기반 제안·적용·페이드·디자인 저장 확인
- 버전 0.44.0, 로컬 배포 산출물 생성 없음
