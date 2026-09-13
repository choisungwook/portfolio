# akbun-terminal Git 패널에 commit 상세와 작업 트리 상태 추가

- Issue: 미정
- Branch: claude/akbun-terminal-git-features-b13zzd

## 실행 계획

- [x] 1. core에 git show와 working(staged/unstaged/stash) 추가
- [x] 2. protocol에 git_show, git_working 명령과 응답 추가 (Rust/Swift 양쪽)
- [x] 3. Swift에 diff 줄 분류 모델과 테스트 추가
- [x] 4. GitTreeView 선택 -> commit 상세 뷰 표시
- [x] 5. 작업 트리 상태 패널(staged/unstaged/stash) 추가와 FileBrowserView 연결
- [ ] 6. wiki/knowledge 갱신, commit, push

## 다음 세션이 알아야 할 것

- 이 컨테이너에는 swift가 없다. Rust만 cargo test로 검증 가능
- Swift 컴파일 검증을 못 했으므로 macOS에서 scripts/bundle.sh를 한 번 돌려야 한다
