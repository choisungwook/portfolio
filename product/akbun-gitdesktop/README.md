# akbun-gitdesktop

로컬 git 저장소의 commit, branch, worktree, git graph와 GitHub의 PR, issue, project를 한 화면에서 보는 데스크톱 앱이다. Electron + TypeScript + React로 만들었고 macOS를 우선 지원하며 Windows, Linux 빌드도 제공한다.

UI 언어는 영어다.

## 화면 구성

- 상단 바: git과 gh CLI 인식 상태 chip, Settings 버튼
- 왼쪽 사이드바: 가져온 git 폴더 목록과 폴더 가져오기 버튼
- 두 번째 열: 선택한 저장소의 worktree 목록. 각 worktree 옆에 "Open with"(VS Code, Finder, Terminal 등)가 있다
- 나머지 화면: 선택한 worktree의 Graph, Branches, Pull requests, Issues, Projects 탭
- 오른쪽 drawer: Graph와 Branches 탭에서는 변경 파일 목록과 git diff, GitHub 탭에서는 issue나 PR의 본문과 comment

선택한 저장소와 worktree는 accent 색 배경과 왼쪽 세로 바로 표시한다.

## 기능

- git graph 보기 (branch, remote, tag ref 포함)
- commit 목록 보기 (graph 행에 subject, author, date, hash 표시)
- commit을 클릭하면 그 commit이 바꾼 파일 목록, 파일을 클릭하면 diff를 오른쪽 drawer에 표시
- branch를 클릭하면 기본 브랜치와의 3-dot diff 파일 목록과 diff를 표시
- branch 보기, 생성, 다중 선택과 일괄 삭제 (Cmd/Ctrl 개별 선택, Shift 범위 선택, 미병합 강제 삭제 확인)
- worktree 보기, 생성(새 브랜치와 함께), 삭제
- GitHub PR과 issue 목록 보기 (state, label, 작성자, 갱신일)
- 하위 issue가 있으면 issue 목록을 트리로 표시. 부모 아래에 하위 issue를 들여쓰고 세로선으로 상하관계를 그리며, 부모 행에는 하위 개수를 ↳ 배지로 표시
- PR이나 issue를 클릭하면 본문과 comment 전체를 오른쪽 drawer에 표시. PR은 base ← head와 변경 파일 수, 추가/삭제 줄 수도 함께 표시
- GitHub project를 Status 필드 기준 칸반으로 보기. 카드가 이 저장소의 issue나 PR이면 클릭해서 drawer로 열고, 다른 저장소의 카드나 draft issue는 브라우저로 연다
- 목록의 ↗ 버튼이나 drawer의 "Open in browser"로 GitHub 원본 열기
- worktree를 외부 앱으로 열기
- dark/light 테마 전환, 기본값은 시스템 설정을 따르는 system
- Settings에서 git, gh CLI의 인식 여부와 버전, 경로, gh 로그인 상태 확인과 재검사
- 앱 메뉴의 Check for Updates…로 새 버전 확인과 설치

## 테마

Settings의 Appearance에서 System, Light, Dark 중 하나를 고른다. 기본값은 System이고 macOS 다크 모드 설정을 따라가며, 앱이 켜져 있는 동안 시스템 설정이 바뀌어도 즉시 반영한다. 선택 값은 userData의 settings.json에 저장하고, main 프로세스가 Electron nativeTheme.themeSource에도 같은 값을 넣어 창 배경까지 함께 바뀌게 한다.

## 설계 원칙: git CLI + gh CLI

git 라이브러리를 쓰지 않고 git command를 직접 실행한다. main 프로세스에서 execFile로 git을 호출하고 결과를 IPC로 renderer에 전달한다. gh CLI는 항상 쓰는 것이 아니라 GitHub의 PR, issue, project를 조회할 때만 실행한다. gh가 없어도 나머지 기능은 모두 동작하며, GitHub 탭 세 개만 사용할 수 없다.

앱을 켜면 상단 바가 git과 gh 설치 여부를 chip으로 보여 준다. git이 없으면 앱이 동작하지 않으므로 경고 배너로 강조하고, gh가 없거나 로그인이 안 되어 있으면 GitHub 탭만 사용할 수 없다고 알린다. Settings의 Command line tools에서 각 CLI의 버전과 경로, gh 로그인 상태를 확인하고 다시 검사할 수 있다.

main 프로세스의 코드도 이 경계를 따라 나뉜다. git command는 `src/main/git.ts`, gh command는 `src/main/github.ts`다. CLI 탐지만 `git.ts`에 함께 둔다.

라이브러리 후보를 검토한 결과다.

- nodegit(libgit2 바인딩): 0.27에서 사실상 개발이 멈췄고, native module이라 Electron 버전마다 리빌드가 필요해 macOS/Windows/Linux 크로스 플랫폼 CI 빌드가 복잡해진다.
- isomorphic-git: 순수 JS라 배포는 쉽지만 이 앱의 핵심인 worktree를 지원하지 않는다.
- simple-git: 결국 git 바이너리를 spawn하는 wrapper라 git 설치 요구사항이 사라지지 않는다. 이 앱이 쓰는 git 명령은 8개뿐이라 30줄짜리 자체 wrapper로 충분하고, 의존성만 늘어난다.
- PR 조회에 Octokit(REST API) 대신 gh CLI를 쓰는 이유: gh는 사용자가 이미 로그인한 인증을 그대로 재사용한다. Octokit을 쓰면 토큰 입력 UI와 안전한 저장(keytar 등)을 앱이 직접 구현해야 한다.

개발자 머신에는 git이 이미 있고 이 앱의 사용자는 개발자이므로, git CLI 직접 실행이 가장 단순하고 유지보수하기 쉬운 선택이다.

## GitHub project를 읽는 방법

project는 저장소가 아니라 user나 organization이 소유한다. 그래서 `gh repo view`로 이 저장소의 owner를 먼저 구하고 그 owner의 project 목록을 조회한다. 저장소 owner와 project owner가 다르면(예: 개인 저장소를 organization project에 연결한 경우) 그 project는 목록에 나오지 않는다.

칸반의 열은 Status 단일 선택 필드의 옵션 순서를 따른다. `gh project field-list`로 옵션을 읽어 비어 있는 열도 자리를 지키게 하고, 이 조회가 실패하면 항목이 도착한 순서로 열을 만든다. Status가 없는 항목은 마지막 "No status" 열로 모은다.

project 조회는 `gh auth login`이 기본으로 주지 않는 scope를 요구한다. 권한이 없으면 Projects 탭이 다음 명령을 안내한다.

```bash
gh auth refresh -s read:project
```

## 하위 issue 트리를 만드는 방법

`gh issue list --json`에는 하위 issue 관계가 없다. 그래서 목록은 그대로 `gh issue list`로 받고, 부모 번호만 GraphQL 한 번으로 따로 받아 합친다. GraphQL은 목록보다 넓은 범위를 같은 정렬(생성 역순)로 조회하므로 목록에 있는 issue는 모두 부모 조회 범위 안에 들어온다.

```bash
gh api graphql -f query='query($owner:String!,$name:String!,$limit:Int!){repository(owner:$owner,name:$name){issues(first:$limit,orderBy:{field:CREATED_AT,direction:DESC}){nodes{number parent{number}}}}}'
```

이 조회가 실패하면 트리 없이 평평한 목록을 보여 준다. 하위 issue 필드를 모르는 GitHub Enterprise나 오래된 gh에서도 issue 목록 자체는 보이는 편이 낫기 때문이다.

트리를 그릴 때 지키는 것 세 가지다.

- 부모가 목록 범위 밖이면 그 issue를 최상위에 두고 `↰ #번호`로 부모를 표시한다. 목록은 최근 issue만 담는 창이라 부모가 밖에 있을 수 있다.
- 부모 관계가 순환하면 도달하지 못한 issue를 최상위로 올린다. 화면에서 issue가 사라지는 것보다 낫다.
- 세로선은 행 안이 아니라 행 전체 높이에 절대 위치로 그린다. 행 안에 두면 padding에서 선이 끊긴다.

issue와 PR의 본문은 GitHub Markdown이지만 렌더링하지 않고 원문 그대로 보여 준다. 렌더링하려면 Markdown parser와 sanitizer를 앱에 들여야 하고, 읽는 용도에는 원문으로 충분하다.

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

테스트. 업데이트 기능이 임시 파일을 남기지 않는지 확인한다. node가 TypeScript의 타입을 벗겨 내고 `src/main/update.ts`를 그대로 읽으므로 빌드 없이 돈다:

```bash
npm test
```

플랫폼별 설치 파일 빌드:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## 업데이트

앱 메뉴 akbun-gitdesktop > Check for Updates…가 GitHub Release API에서 gitdesktop-v 태그의 최신 버전을 찾아 현재 버전과 비교한다. 새 버전이 있으면 dmg를 임시 디렉터리에 받아 교체 스크립트를 분리 프로세스로 띄우고 앱을 종료하며, 스크립트가 .app 번들을 통째로 바꾸고 다시 실행한다.

dmg에 서명이 없어 Squirrel.Mac 기반 자동 업데이트(electron-updater)를 쓸 수 없다. 앱이 fetch로 받은 파일에는 quarantine 속성이 붙지 않아 Gatekeeper를 거치지 않고 교체할 수 있다는 점을 이용한다. 배경은 [knowledge/decisions/2026-07-unsigned-desktop-app-self-update.md](./knowledge/decisions/2026-07-unsigned-desktop-app-self-update.md)에 있다.

교체는 macOS 패키지 빌드에서만 동작한다. 개발 모드(`npm run dev`)에서는 교체 대상이 Electron.app이고, Windows와 Linux 빌드에는 받을 dmg가 없다. 두 경우 모두 릴리즈 페이지를 여는 버튼만 보여 준다.

용량이 큰 dmg를 다루므로 정리 지점을 세 곳에 둔다. 세 지점은 `test/update-disk-leak.test.js`가 검증하고 PR의 verify job에서 돈다.

1. `downloadDmg`가 내려받기에 실패하면 만든 임시 디렉터리를 지운다.
2. 교체 스크립트의 trap이 어느 단계에서 실패해도 작업 디렉터리와 mount를 지운다.
3. 앱 시작 때 `cleanupTempDirs`가 강제 종료로 남은 임시 디렉터리를 지운다.

## 릴리즈

PR에서는 같은 workflow의 verify job이 ubuntu에서 typecheck와 테스트만 돌린다. `ELECTRON_SKIP_BINARY_DOWNLOAD`로 electron 바이너리를 받지 않으므로 앱 없이 끝난다.

master에 이 디렉터리 변경이 병합되면 GitHub Actions(gitdesktop-release.yml)가 릴리즈를 만든다. 버전은 기존 gitdesktop-v 태그 중 가장 높은 값의 patch를 +1 해서 정하므로, 매 실행마다 새 버전이 나오고 기존 릴리즈를 덮어쓰지 않는다. package.json의 version이 그보다 높으면 그 값을 쓰므로 major, minor는 package.json을 직접 올려서 바꾼다. 태그가 이미 있으면 workflow는 실패한다.
