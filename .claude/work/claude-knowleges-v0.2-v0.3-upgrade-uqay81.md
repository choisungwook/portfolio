# knowledge 번들을 OKF 0.3으로 업그레이드

- Branch: claude/knowleges-v0.2-v0.3-upgrade-uqay81

## 실행 계획

- [x] 1. 스펙 사본을 templates/okf-spec-0.3.md 하나로 두고 번들 사본 삭제
- [x] 2. 번들 index.md, references/index.md의 버전 표기와 okf_version 갱신 (44곳)
- [x] 3. 0.1 형식 concept 143개를 generated, sources로 변환
- [x] 4. 번들 log.md에 변경 기록
- [x] 5. .claude/rules/knowledge.md를 0.3 기준으로 수정
- [ ] 6. 리뷰, PR 생성, squash merge

## 다음 세션이 알아야 할 것

- 번들마다 스펙 사본을 두면 push 검사 용량(1.5MB)을 넘어 push가 거부됨. 사용자 결정으로 템플릿 밖 사본 하나만 둠
