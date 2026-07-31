# 사용자 가이드

akbun-terraform-apply-remote를 설치하고 GitHub 저장소에 연결하는 방법을 정리한다.

## 요구사항

- 서버에 terraform과 git이 설치되어 있어야 한다.
- GitHub 인증: 대상 저장소의 Contents(read)와 Pull requests/Issues(write) 권한이 필요하다. fine-grained PAT 또는 GitHub App 중 선택한다. 아래 인증 옵션 절을 본다.
- 서버는 GitHub에서 접근 가능한 주소(도메인 또는 공인 IP)로 노출되어야 한다.

## 빌드

소스에서 릴리스 바이너리를 빌드한다. GitHub Actions 파이프라인(build-terraform-apply-remote)이 master 빌드마다 linux 바이너리 artifact를 올리므로 그것을 받아도 된다.

```bash
cargo build --release
# 산출물: target/release/akbun-terraform-apply-remote
```

## 실행

환경변수로 설정을 주입하고 실행한다. 인증은 PAT(`ATR_GITHUB_TOKEN`) 또는 GitHub App(`ATR_GITHUB_APP_*`) 중 하나만 설정한다.

```bash
export ATR_GITHUB_TOKEN=ghp_xxx        # 인증 방식 1: PAT
export ATR_WEBHOOK_SECRET=random-long  # 필수. webhook 서명 검증 secret
export ATR_PORT=4141                   # 선택. 기본 4141
export ATR_TRIGGER=terraform           # 선택. comment 명령 트리거 단어
export ATR_TERRAFORM_BIN=terraform     # 선택. terraform 실행 파일 경로
export ATR_DATA_DIR=./data             # 선택. PR checkout 저장 위치
./akbun-terraform-apply-remote
```

terraform이 AWS 등 provider 자격증명을 요구하면 같은 프로세스 환경에 함께 주입한다(예: `AWS_PROFILE`, instance role).

## 인증 옵션

두 방식 중 하나를 선택한다. 둘 다 설정하면 기동 시 에러로 종료한다.

**방식 1 - fine-grained PAT (간단)**: `ATR_GITHUB_TOKEN`에 토큰을 넣는다. 대상 저장소에 Contents Read, Issues Read/Write, Pull requests Read/Write 권한을 준다. 장기 토큰이 서버에 존재하는 것이 단점이다.

**방식 2 - GitHub App 임시 토큰 (권장)**: 장기 토큰 대신 1시간짜리 installation token을 서버가 스스로 발급받는다. private key만 디스크에 두면 되고, 유출 시 App 단위로 즉시 폐기할 수 있다. bot 이름으로 comment가 달려 사람 계정과 구분되는 것도 장점이다.

GitHub App 설정 절차:

1. GitHub Settings > Developer settings > GitHub Apps > New GitHub App으로 App을 만든다. Webhook은 비활성화해도 된다(저장소 webhook을 따로 쓴다).
2. Repository permissions에서 Contents Read-only, Issues Read and write, Pull requests Read and write를 준다.
3. 생성된 App의 App ID를 기록하고, Private keys에서 키를 생성해 pem 파일을 내려받는다.
4. 대상 저장소(또는 조직)에 App을 Install하고, 설치 후 URL의 마지막 숫자(installation id)를 기록한다.
5. 아래 환경변수를 설정하고 서버를 실행한다.

```bash
export ATR_GITHUB_APP_ID=123456
export ATR_GITHUB_APP_PRIVATE_KEY_PATH=/opt/atr/app-private-key.pem
export ATR_GITHUB_APP_INSTALLATION_ID=98765432
```

서버는 private key로 9분짜리 JWT를 서명해 installation token(유효 1시간)을 발급받고, 만료 10분 전에 자동으로 재발급한다. 토큰은 API 호출과 git fetch에만 쓰이고 디스크에 남지 않는다.

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
| `terraform plan` | 변경된 모든 terraform 프로젝트를 plan한다 |
| `terraform plan -d <dir>` | 지정한 디렉터리만 plan한다 |
| `terraform apply` | 저장된 plan을 모두 apply한다 |
| `terraform apply -d <dir>` | 지정한 디렉터리의 plan만 apply한다 |
| `terraform import <주소> <ID>` | 기존 리소스를 terraform state로 import한다. 예: `terraform import aws_vpc.main vpc-123` |
| `terraform import -d <dir> <주소> <ID>` | 지정한 디렉터리에서 import한다. PR이 여러 프로젝트를 바꿨으면 -d가 필수다 |
| `terraform unlock` | 이 PR이 잡은 lock을 모두 해제한다 |
| `terraform help` | 사용법을 comment로 남긴다 |

트리거 단어(`terraform`)는 `ATR_TRIGGER`로 바꿀 수 있다. 명령은 comment의 한 줄이 트리거 단어로 시작할 때만 인식한다.

## 동작 규칙

- **apply는 저장된 plan만 적용한다.** plan 이후 PR에 push가 있으면 apply를 거부하고 재plan을 요구한다. 리뷰한 내용과 적용되는 내용이 항상 같다.
- **프로젝트 lock**: 한 프로젝트 디렉터리를 먼저 plan한 PR이 lock을 잡는다. 다른 PR은 apply가 끝나거나 unlock될 때까지 그 프로젝트를 plan/apply할 수 없다. lock은 apply 성공, PR close, `terraform unlock` 시 해제된다.
- **import 후에는 재plan**: import는 state를 바꾸므로 저장된 plan을 무효화한다. import 결과 comment의 안내대로 plan을 다시 실행하고 리뷰한 뒤 apply한다.
- **fork PR 지원**: PR head를 base 저장소의 `pull/N/head` ref에서 가져오므로 fork에서 온 PR도 동작한다.
- **재시작/재배포에 안전**: lock과 plan 기록은 data 디렉터리의 state.json에 영속화되어 재시작한 서버가 이어받는다. SIGTERM을 받으면 진행 중인 terraform 실행을 마친 뒤 종료한다(graceful drain). data 디렉터리 자체를 잃은 경우에만 `terraform plan`을 다시 실행한다.

AWS(EC2, ECS) 배포는 [deploy-guide.md](./deploy-guide.md)를 본다.

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| webhook이 401을 반환 | webhook Secret과 `ATR_WEBHOOK_SECRET` 불일치 |
| comment에 반응이 없음 | 트리거 단어 불일치, 또는 comment가 트리거 단어로 시작하는 줄이 없음 |
| plan은 되는데 apply가 거부됨 | plan 이후 PR head가 바뀜. 다시 plan한다 |
| "locked by pull request #N" | 다른 PR이 같은 프로젝트를 작업 중. 그 PR을 apply하거나 unlock한다 |
