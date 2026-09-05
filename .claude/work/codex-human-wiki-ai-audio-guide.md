# AI 오디오 사용 가이드 작성과 병합

- Issue: #1173
- Branch: codex/human-wiki-ai-audio-guide

## 실행 계획

- [x] 1. 문서·제품·GitHub 규칙과 현재 AI 오디오 구현 확인
- [x] 2. 자막 생성·SRT 저장·무음 제거 사용 가이드와 human-wiki 인덱스 작성
- [x] 3. Markdown 링크와 구현 근거 검증
- [ ] 4. 변경 커밋·푸시와 PR 생성
- [ ] 5. 리뷰·CI 확인 후 squash merge와 Issue 종료

## 다음 세션이 알아야 할 것

- 대상 기능은 akbun-makevideo 0.43.0 이상이며 문서는 akbun-makepresentation/human-wiki에 둠
- 자막 생성은 첫 subtitle track의 기존 자막을 교체하고, 무음 제거는 모든 track에서 같은 구간을 제거함
