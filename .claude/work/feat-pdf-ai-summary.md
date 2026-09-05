# Codex 기반 PDF AI 요약

- Issue: #1150
- Branch: feat/pdf-ai-summary

## 실행 계획

- [x] 1. Issue #1150에서 OCR을 제거하고 로컬 LLM 후속 티켓 분리
- [x] 2. Codex App Server 인증·모델·설정·JSONL 저장 기반 구현
- [x] 3. 페이지 선택 모달·요약 승인·텍스트와 이미지 묶음 요약 구현
- [x] 4. AI 채팅 패널·대화 관리·시스템 프롬프트 프리셋 UI 구현
- [x] 5. 테스트·브라우저 화면·Codex 연동 검증과 wiki·ADR 갱신
- [ ] 6. repo-pr-ship으로 리뷰·머지·Issue 종료·릴리스 확인

## 다음 세션이 알아야 할 것

- 기본 모델은 gpt-5.6-luna, effort는 low
- 선택 범위는 현재 페이지, 직접 지정, 전체 페이지
- 전체 문서는 텍스트와 페이지 이미지를 묶음 요약한 뒤 최종 종합
- 대화는 앱 데이터의 JSONL로 자동 저장하고 이름 변경·삭제·재개 지원
- 로컬 OpenAI 호환 endpoint 실제 호출은 별도 후속 Issue 범위
