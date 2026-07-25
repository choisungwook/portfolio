# akbun-gitdesktop

로컬 git 저장소의 commit, branch, worktree, git graph, GitHub PR을 한 화면에서 보는 데스크톱 앱이다. Electron + TypeScript + React로 만들었고 macOS를 우선 지원하며 Windows, Linux 빌드도 제공한다.

UI 언어는 영어다.

## 화면 구성

- 상단 바: git과 gh CLI 인식 상태 chip, Settings 버튼
- 왼쪽 사이드바: 가져온 git 폴더 목록과 폴더 가져오기 버튼
- 두 번째 열: 선택한 저장소의 worktree 목록. 각 worktree 옆에 "Open with"(VS Code, Finder, Terminal 등)가 있다
- 나머지 화면: 선택한 worktree의 git graph, 브랜치 목록, GitHub PR 목록 탭
- 오른쪽 drawer: commit이나 branch를 클릭하면 열리는 변경 파일 목록과 git diff

선택한 저장소와 worktree는 accent 색 배경과 왼쪽 세로 바로 표시한다.

## 기능

- git graph 보기 (branch, remote, tag ref 포함)
- commit 목록 보기 (graph 행에 subject, author, date, hash 표시)
- commit을 클릭하면 그 commit이 바꾼 파일 목록, 파일을 클릭하면 diff를 오른쪽 drawer에 표시
- branch를 클릭하면 기본 브랜치와의 3-dot diff 파일 목록과 diff를 표시
- branch 보기, 생성, 삭제 (미병합 브랜치는 확인 후 강제 삭제)
- worktree 보기, 생성(새 브랜치와 함께), 삭제
- GitHub PR 목록 보기 (gh CLI 사용, 클릭하면 브라우저로 이동)
- worktree를 외부 앱으로 열기
- dark/light 테마 전환, 기본값은 시스템 설정을 따르는 system
- Settings에서 git, gh CLI의 인식 여부와 버전, 경로, gh 로그인 상태 확인과 재검사

## 테마

Settings의 Appearance에서 System, Light, Dark 중 하나를 고른다. 기본값은 System이고 macOS 다크 모드 설정을 따라가며, 앱이 켜져 있는 동안 시스템 설정이 바뀌어도 즉시 반영한다. 선택 값은 userData의 settings.json에 저장하고, main 프로세스가 Electron nativeTheme.themeSource에도 같은 값을 넣어 창 배경까지 함께 바뀌게 한다.

## 설계 원칙: git CLI + gh CLI

git 라이브러리를 쓰지 않고 git command를 직접 실행한다. main 프로세스에서 execFile로 git을 호출하고 결과를 IPC로 renderer에 전달한다. gh CLI는 항상 쓰는 것이 아니라 GitHub PR 목록을 조회할 때만 실행한다. gh가 없어도 나머지 기능은 모두 동작하며, PR 보기만 사용할 수 없다.

앱을 켜면 상단 바가 git과 gh 설치 여부를 chip으로 보여 준다. git이 없으면 앱이 동작하지 않으므로 경고 배너로 강조하고, gh가 없거나 로그인이 안 되어 있으면 PR 보기만 사용할 수 없다고 알린다. Settings의 Command line tools에서 각 CLI의 버전과 경로, gh 로그인 상태를 확인하고 다시 검사할 수 있다.

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

master에 이 디렉터리 변경이 병합되면 GitHub Actions(gitdesktop-release.yml)가 릴리즈를 만든다. 버전은 기존 gitdesktop-v 태그 중 가장 높은 값의 patch를 +1 해서 정하므로, 매 실행마다 새 버전이 나오고 기존 릴리즈를 덮어쓰지 않는다. package.json의 version이 그보다 높으면 그 값을 쓰므로 major, minor는 package.json을 직접 올려서 바꾼다. 태그가 이미 있으면 workflow는 실패한다.
