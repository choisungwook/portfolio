# akbun-makevideo 로컬 음성 정리 (잡음 제거, 군더더기 말 제거)

- Branch: claude/eager-chaum-907b7e

## 실행 계획

- [x] 1. 잡음 제거: Clip.denoise, SetClipDenoise, afftdn 필터를 render와 preview에 공통 적용
- [x] 2. Inspector 토글과 강도
- [x] 3. preview와 render 일치 검증 (audio/tests/amix.rs)
- [ ] 4. 군더더기 말 제거: 로컬 전사 + 로컬 LLM 선택 + 검토 후 removeRanges 적용
- [ ] 5. 문서, knowledge, 버전

## 다음 세션이 알아야 할 것

- afftdn의 tn=1은 잡음 바닥을 추적하지 못해 효과가 없었음. 강도로 nr과 nf를 함께 올림
