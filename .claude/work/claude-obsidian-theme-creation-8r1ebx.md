# Obsidian 테마 product 생성 (akbun-obsidian-theme)

- Issue: #1249 (root #1248)
- Branch: claude/obsidian-theme-creation-8r1ebx

## 실행 계획

- [x] 1. 모노repo에서 Obsidian 테마 인식 여부 확인 — 수동 설치와 release 첨부는 가능, community 목록은 repo root의 manifest.json만 읽으므로 전용 repo 필요
- [x] 2. workspace 작성 (manifest.json, theme.css, package.json, 테스트)
- [x] 3. release workflow 작성 (PR verify, master push release, 전용 repo mirror)
- [x] 4. README, wiki, adr, knowledge 작성
- [x] 5. product/README.md, 루트 README.md, products.json 갱신
- [x] 6. GitHub Issue 생성 (root issue 하위)
- [ ] 7. commit, push

## 다음 세션이 알아야 할 것

- 전용 repo(choisungwook/akbun-obsidian-theme)는 아직 없음. workflow의 mirror 단계는 OBSIDIAN_THEME_REPO_TOKEN secret이 있을 때만 돔
- 512x288 스크린샷은 실제 Obsidian 화면이 필요해 아직 없음. community 제출 전에 추가
