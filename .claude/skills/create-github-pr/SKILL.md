---
name: create-github-pr
description: >
  Creates well-structured GitHub pull requests using gh CLI with clear,
  Korean-language descriptions. Analyzes the latest commit message and code
  changes (git diff) to generate a PR title and a concise Korean body that
  anyone can understand at a glance. Use this skill whenever the user wants
  to create a pull request, open a PR, or submit changes for review — even
  if they just say "PR 만들어줘" or "리뷰 올려줘". Triggers on: "create pull
  request", "make a PR", "open PR", "submit for review", "PR 만들어줘",
  "PR 올려줘", "풀리퀘스트", "리뷰 요청", "PR 생성", or any request to create
  a GitHub pull request from current changes.
allowed_tools:
  - "Bash(git *)"
  - "Bash(gh *)"
---

# GitHub Pull Request Creation Skill

커밋 메시지와 코드 변경 사항을 분석하여 간결한 한국어 PR을 생성한다.

## Prerequisites

- `gh` CLI가 인증된 상태
- 현재 브랜치에 PR할 커밋이 존재
- git repository 안에서 실행

## Step-by-Step Process

### 1. 최신 커밋 정보 가져오기

````bash
# 커밋 메시지 (제목 + 본문)
git log -1 --pretty=format:"%s%n%b"

# 커밋 해시
git log -1 --pretty=format:"%H"
````

### 2. 코드 변경 사항 분석

````bash
# 변경된 파일 목록 (Added/Modified/Deleted)
git diff HEAD~1 HEAD --name-status

# 텍스트 파일의 상세 변경 내용 (바이너리 제외)
git diff HEAD~1 HEAD --diff-filter=d -- . ':!*.png' ':!*.jpg' ':!*.jpeg' ':!*.gif' ':!*.svg' ':!*.ico' ':!*.pdf' ':!*.zip' ':!*.tar' ':!*.gz' ':!*.mp4' ':!*.mov' ':!*.avi' ':!*.mp3' ':!*.wav' ':!*.ttf' ':!*.woff' ':!*.woff2' ':!*.eot' ':!*.otf' ':!*.exe' ':!*.dll' ':!*.so' ':!*.dylib' ':!*.bin' ':!*.dat'

# 변경 통계
git diff HEAD~1 HEAD --stat
````

### 3. 바이너리 파일 처리

바이너리 파일의 내용은 읽지 않는다. `--name-status`의 파일명만 참고하고, 중요한 바이너리(예: 새 로고)만 PR 본문에 언급한다.

### 4. PR 구성 요소 추출

**Title**: 커밋 메시지 첫 줄을 그대로 사용

**Body**: 한국어로 작성하되, 핵심만 간결하게 전달

### 5. PR 본문 작성 (한국어)

PR 본문은 누구나 "이 PR이 뭘 하는지" 바로 파악할 수 있어야 한다.
불필요한 세부 사항은 빼고, 핵심 의도와 주요 변경만 담는다.

````markdown
## 작업 내용
[이 PR이 해결하는 문제 또는 달성하는 목표를 1~2문장으로 설명]

## 주요 변경 사항
- [핵심 변경 1]
- [핵심 변경 2]
- [핵심 변경 3]

## 참고 사항
[선택: 브레이킹 체인지, 마이그레이션, 테스트 관련 메모 등. 없으면 이 섹션 생략]
````

작성 원칙:

- "작업 내용"은 **왜** 이 변경이 필요한지 설명한다
- "주요 변경 사항"은 3~5개 이내의 불릿으로 핵심만 나열한다
- 파일 목록을 나열하지 않는다 (GitHub "Files changed" 탭에서 확인 가능)
- 코드 스니펫은 정말 필요한 경우에만 포함한다
- "참고 사항"은 특별한 내용이 없으면 생략한다

### 6. PR 생성

````bash
gh pr create --title "TITLE" --body "$(cat <<'EOF'
## 작업 내용
...

## 주요 변경 사항
- ...

EOF
)"
````

## 예시

### 입력: 커밋 메시지

````
feat: add user authentication with JWT
````

### 생성된 PR 본문

````markdown
## 작업 내용
JWT 기반 인증 시스템을 구현하여 API 엔드포인트를 보호하고 토큰 기반 사용자 세션을 관리합니다.

## 주요 변경 사항
- JWT 토큰 발급/검증 로직 구현 (24시간 만료)
- 로그인/로그아웃 엔드포인트 추가
- 토큰 검증 미들웨어로 보호 라우트 적용
- bcrypt를 사용한 비밀번호 해싱 처리
- PyJWT, bcrypt 의존성 추가

## 참고 사항
인증 관련 테스트 케이스를 함께 추가했습니다.
````

## 에러 처리

**커밋이 없는 경우**: 최소 하나의 커밋이 필요하다고 안내

**gh 인증 실패**: `gh auth status`로 확인 안내

**브랜치 미푸시**: `git push -u origin HEAD` 실행 후 재시도

## 분석 가이드라인

**포함할 내용:**

- 변경의 의도 (왜)
- 구현 접근 방식 (어떻게)
- 새로운 의존성과 그 이유
- 브레이킹 체인지

**제외할 내용:**

- 파일별 변경 목록 (diff에서 확인 가능)
- 바이너리 파일 내용
- 포맷팅/공백 변경
- diff에서 자명한 변경 사항
