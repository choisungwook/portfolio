# akbun-gitdesktop

로컬 git 저장소의 commit, branch, worktree, git graph, GitHub PR을 한 화면에서 보는 데스크톱 앱이다. Electron + TypeScript + React로 만들었고 macOS를 우선 지원하며 Windows, Linux 빌드도 제공한다.

## 화면 구성

- 왼쪽 사이드바: 가져온 git 폴더 목록과 폴더 가져오기 버튼
- 두 번째 열: 선택한 저장소의 worktree 목록. 각 worktree 옆에 "다음으로 열기"(VS Code, Finder, Terminal 등)가 있다
- 나머지 화면: 선택한 worktree의 git graph, 브랜치 목록, GitHub PR 목록 탭

## 기능

- git graph 보기 (branch, remote, tag ref 포함)
- commit 목록 보기 (graph 행에 subject, author, date, hash 표시)
- branch 보기, 생성, 삭제 (미병합 브랜치는 확인 후 강제 삭제)
- worktree 보기, 생성(새 브랜치와 함께), 삭제
- GitHub PR 목록 보기 (gh CLI 사용, 클릭하면 브라우저로 이동)
- worktree를 외부 앱으로 열기

## 설계 원칙: git CLI + gh CLI

git 라이브러리를 쓰지 않고 git command를 직접 실행한다. main 프로세스에서 execFile로 git을 호출하고 결과를 IPC로 renderer에 전달한다. PR 조회는 GitHub 공식 CLI인 gh를 사용하므로 gh auth login이 되어 있어야 한다.

라이브러리 후보를 검토한 결과다.

- nodegit(libgit2 바인딩): 0.27에서 사실상 개발이 멈췄고, native module이라 Electron 버전마다 리빌드가 필요해 macOS/Windows/Linux 크로스 플랫폼 CI 빌드가 복잡해진다.
- isomorphic-git: 순수 JS라 배포는 쉽지만 이 앱의 핵심인 worktree를 지원하지 않는다.
- simple-git: 결국 git 바이너리를 spawn하는 wrapper라 git 설치 요구사항이 사라지지 않는다. 이 앱이 쓰는 git 명령은 8개뿐이라 30줄짜리 자체 wrapper로 충분하고, 의존성만 늘어난다.
- PR 조회에 Octokit(REST API) 대신 gh CLI를 쓰는 이유: gh는 사용자가 이미 로그인한 인증을 그대로 재사용한다. Octokit을 쓰면 토큰 입력 UI와 안전한 저장(keytar 등)을 앱이 직접 구현해야 한다.

개발자 머신에는 git이 이미 있고 이 앱의 사용자는 개발자이므로, git CLI 직접 실행이 가장 단순하고 유지보수하기 쉬운 선택이다.

## 개발

의존성 설치와 개발 서버 실행:

```bash
npm install
npm run dev
```

타입 검사:

```bash
npm run typecheck
```

플랫폼별 설치 파일 빌드:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## 릴리즈

master에 이 디렉터리 변경이 병합되면 GitHub Actions(gitdesktop-release.yml)가 package.json의 version을 읽어 gitdesktop-vX.Y.Z 태그와 릴리즈를 만들고, macOS(dmg), Windows(nsis), Linux(AppImage) 설치 파일을 릴리즈에 업로드한다. 버전을 올리지 않으면 태그가 이미 존재하므로 릴리즈를 건너뛴다.
