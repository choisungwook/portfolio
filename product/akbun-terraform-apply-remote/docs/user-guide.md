# 사용자 가이드

akbun-terraform-apply-remote를 설치하고 GitHub 저장소에 연결하는 방법을 정리한다.

## 요구사항

- 서버에 terraform과 git이 설치되어 있어야 한다.
- GitHub token: 대상 저장소의 Contents(read)와 Pull requests/Issues(write) 권한이 필요하다. fine-grained PAT 또는 GitHub App 설치 token을 사용한다.
- 서버는 GitHub에서 접근 가능한 주소(도메인 또는 공인 IP)로 노출되어야 한다.

## 빌드

소스에서 릴리스 바이너리를 빌드한다. GitHub Actions 파이프라인(build-terraform-apply-remote)이 master 빌드마다 linux 바이너리 artifact를 올리므로 그것을 받아도 된다.

```bash
cargo build --release
# 산출물: target/release/akbun-terraform-apply-remote
```

## 실행

환경변수로 설정을 주입하고 실행한다.

```bash
export ATR_GITHUB_TOKEN=ghp_xxx        # 필수. GitHub API 토큰
export ATR_WEBHOOK_SECRET=random-long  # 필수. webhook 서명 검증 secret
export ATR_PORT=4141                   # 선택. 기본 4141
export ATR_TRIGGER=akbun               # 선택. comment 명령 트리거 단어
export ATR_TERRAFORM_BIN=terraform     # 선택. terraform 실행 파일 경로
export ATR_DATA_DIR=./data             # 선택. PR checkout 저장 위치
./akbun-terraform-apply-remote
```

terraform이 AWS 등 provider 자격증명을 요구하면 같은 프로세스 환경에 함께 주입한다(예: `AWS_PROFILE`, instance role).

## Webhook 등록

대상 저장소의 Settings > Webhooks에서 추가한다.

- Payload URL: `https://<서버 주소>/events`
- Content type: `application/json`
- Secret: `ATR_WEBHOOK_SECRET`과 같은 값
- 이벤트: "Let me select individual events"에서 **Issue comments**와 **Pull requests**를 선택

등록 후 서버 헬스체크로 연결을 확인한다.

```bash
curl https://<서버 주소>/healthz
```

## 사용법

PR을 열면 변경된 terraform 디렉터리를 자동으로 plan하고 결과를 comment로 남긴다. 이후는 PR comment로 조작한다.

| 명령 | 동작 |
|---|---|
| `akbun plan` | 변경된 모든 terraform 프로젝트를 plan한다 |
| `akbun plan -d <dir>` | 지정한 디렉터리만 plan한다 |
| `akbun apply` | 저장된 plan을 모두 apply한다 |
| `akbun apply -d <dir>` | 지정한 디렉터리의 plan만 apply한다 |
| `akbun unlock` | 이 PR이 잡은 lock을 모두 해제한다 |
| `akbun help` | 사용법을 comment로 남긴다 |

트리거 단어(`akbun`)는 `ATR_TRIGGER`로 바꿀 수 있다. 명령은 comment의 한 줄이 트리거 단어로 시작할 때만 인식한다.

## 동작 규칙

- **apply는 저장된 plan만 적용한다.** plan 이후 PR에 push가 있으면 apply를 거부하고 재plan을 요구한다. 리뷰한 내용과 적용되는 내용이 항상 같다.
- **프로젝트 lock**: 한 프로젝트 디렉터리를 먼저 plan한 PR이 lock을 잡는다. 다른 PR은 apply가 끝나거나 unlock될 때까지 그 프로젝트를 plan/apply할 수 없다. lock은 apply 성공, PR close, `akbun unlock` 시 해제된다.
- **fork PR 지원**: PR head를 base 저장소의 `pull/N/head` ref에서 가져오므로 fork에서 온 PR도 동작한다.
- 서버를 재시작하면 저장된 plan 기록이 사라진다. 이때는 `akbun plan`을 다시 실행한다.

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| webhook이 401을 반환 | webhook Secret과 `ATR_WEBHOOK_SECRET` 불일치 |
| comment에 반응이 없음 | 트리거 단어 불일치, 또는 comment가 트리거 단어로 시작하는 줄이 없음 |
| plan은 되는데 apply가 거부됨 | plan 이후 PR head가 바뀜. 다시 plan한다 |
| "locked by pull request #N" | 다른 PR이 같은 프로젝트를 작업 중. 그 PR을 apply하거나 unlock한다 |
