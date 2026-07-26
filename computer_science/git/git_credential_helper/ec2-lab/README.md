# EC2에서 git 인증을 하나씩 관찰하기

[학습 계획](../docs/study-plan.md) 3단계 실습이다. git이 인증할 때 어떤 파일과 환경변수를 보는지, 자격증명이 어디에 남는지를 EC2 인스턴스에서 직접 확인한다.

로컬 머신에서 하지 않는 이유가 있다. 로컬에는 이미 키체인 helper나 기존 `~/.gitconfig`가 깔려 있어 관찰 결과가 오염된다. 빈 인스턴스에서 시작해야 무엇이 언제 생기는지 보인다.

> 아래 명령은 git 공식 문서와 AWS 문서를 근거로 작성했고, 이 저장소에서 실행해 검증하지는 않았다. 출력은 예상값이므로 실제와 다르면 그 차이가 학습 지점이다.

## 준비

인스턴스를 만든다. SSH를 열지 않고 SSM Session Manager로 접속한다.

```bash
cd terraform && terraform init && terraform apply
```

실습용 GitHub 토큰을 SSM Parameter에 넣는다. Terraform이 값을 만들지 않으므로 직접 넣는다. private repo에 read 권한만 있는 토큰을 쓴다.

```bash
aws ssm put-parameter --name "/git-credential-helper-lab/github-token" --type SecureString --value "<your-token>"
```

접속한다.

```bash
aws ssm start-session --target "$(terraform output -raw instance_id)"
```

이후 명령은 인스턴스 안에서 실행한다. `ORG/REPO`는 본인의 private repo로 바꾼다.

## 1. 아무 설정 없이 clone하면 무엇을 묻는가

터미널 프롬프트를 막고 clone한다. 막지 않으면 입력 대기에서 멈춘다.

```bash
GIT_TERMINAL_PROMPT=0 git clone https://github.com/ORG/REPO.git
```

`could not read Username ... terminal prompts disabled`가 나온다. git이 자격증명을 어디에서도 찾지 못했고, 마지막 수단인 프롬프트마저 막혔다는 뜻이다. 이 상태가 출발점이다.

## 2. git이 읽는 config 파일 확인

git이 실제로 어떤 파일을 읽었는지 출처와 함께 본다.

```bash
git config --list --show-origin --show-scope
```

빈 인스턴스라 거의 비어 있다. system(`/etc/gitconfig`) → global(`~/.gitconfig`) → local(`.git/config`) 순으로 쌓이고, 뒤에 오는 것이 앞을 덮는다. `credential.helper`만은 덮지 않고 **누적**된다는 점이 뒤에서 중요해진다.

## 3. URL에 토큰을 박으면 어디에 남는가 (보안 리스크 1)

가장 흔한 임시방편을 해 보고, 토큰이 어디에 남는지 추적한다.

```bash
TOKEN="$(aws ssm get-parameter --name /git-credential-helper-lab/github-token --with-decryption --query Parameter.Value --output text)"
git clone "https://x-access-token:${TOKEN}@github.com/ORG/REPO.git" repo-url-embed
```

clone은 성공한다. 이제 토큰이 남은 자리를 찾는다.

```bash
grep -r "url = " repo-url-embed/.git/config
history | tail -5
```

`.git/config`의 remote URL에 토큰이 그대로 박혀 있다. 이 저장소를 누가 복사하거나 remote를 출력하는 로그를 남기면 토큰이 함께 나간다. 셸 히스토리에도 남는다. **이것이 credential helper가 존재하는 이유다.**

## 4. store helper — 파일에 평문으로 남긴다

git 내장 helper 중 가장 단순한 것을 걸어 본다.

```bash
git config --global credential.helper store
git clone https://github.com/ORG/REPO.git repo-store
```

username과 password를 물으면 `x-access-token`과 토큰을 넣는다. 성공하면 git이 helper에게 `store`를 보낸다. 결과를 확인한다.

```bash
ls -l ~/.git-credentials && cat ~/.git-credentials
```

`https://x-access-token:토큰@github.com` 한 줄이 평문으로 있다. 파일 권한이 600이어도 평문인 것은 변하지 않는다. remote URL에서는 사라졌지만 홈 디렉터리로 자리를 옮겼을 뿐이다. **리스크는 사라지지 않고 이동한다.**

## 5. cache helper — 메모리와 소켓

저장 위치를 디스크에서 메모리로 바꿔 본다.

```bash
git config --global --unset-all credential.helper
git config --global credential.helper 'cache --timeout=60'
git clone https://github.com/ORG/REPO.git repo-cache
```

helper가 데몬과 소켓을 만든다.

```bash
ls -la ~/.cache/git/credential/ 2>/dev/null || ls -la ~/.git-credential-cache/
ps -ef | grep [c]redential-cache
```

타임아웃이 지나면 데몬이 사라지고 다시 물어본다. 저장 위치와 수명이 helper의 구현 사항일 뿐 git의 관심사가 아니라는 것이 보인다.

## 6. custom helper — 토큰을 디스크에 두지 않는다

Terraform이 `/usr/local/bin/git-credential-ssm`을 심어 두었다. 호출될 때마다 IAM 권한으로 SSM에서 토큰을 가져와 응답하는 helper다.

먼저 helper 자체를 git 없이 손으로 호출해 규약을 확인한다.

```bash
printf 'protocol=https\nhost=github.com\n\n' | git-credential-ssm get
```

`username=x-access-token`과 `password=...`가 나온다. 이제 이 helper를 걸고 clone한다.

```bash
git config --global --unset-all credential.helper
git config --global credential.helper ssm
git clone https://github.com/ORG/REPO.git repo-ssm
```

`credential.helper=ssm`이라고만 썼는데 동작한다. git이 `git-credential-<이름>`을 PATH에서 찾기 때문이다. 토큰이 남았는지 확인한다.

```bash
cat ~/.git-credentials 2>/dev/null; grep -r "url = " repo-ssm/.git/config
```

아무 데도 없다. 토큰은 helper가 호출되는 순간에만 존재한다. **CodeBuild helper가 하는 일이 정확히 이것이고, 차이는 토큰을 SSM이 아니라 빌드 agent에서 가져온다는 것뿐이다.** 대신 토큰을 얻을 권한이 파일 접근에서 IAM으로 옮겨갔다. 이것이 이 방식의 리스크 위치다.

## 7. 우선순위 실험

읽은 규칙을 눈으로 확인한다.

helper가 누적되는 것과 빈 값이 리셋하는 것을 본다.

```bash
git config --global credential.helper       # ssm 하나
git -c credential.helper= -c credential.helper=store config --get-all credential.helper
```

helper가 응답하지 않으면 다음 순서로 넘어가는 것을 본다. 없는 helper를 앞에 걸고, 뒤의 helper가 답하는지 확인한다.

```bash
GIT_TERMINAL_PROMPT=0 git -c credential.helper='!true' -c credential.helper=ssm \
  credential fill <<< $'protocol=https\nhost=github.com\n'
```

`quit=true`를 출력하는 helper를 앞에 걸면 뒤 helper도 프롬프트도 없이 끝나는 것을 본다.

```bash
GIT_TERMINAL_PROMPT=0 git -c credential.helper='!echo quit=true #' -c credential.helper=ssm \
  credential fill <<< $'protocol=https\nhost=github.com\n'
```

`useHttpPath`를 켜면 helper에 들어가는 입력에 `path`가 붙는 것을 본다. CodeBuild가 켜 두는 바로 그 옵션이다.

```bash
git -c credential.useHttpPath=true -c credential.helper='!cat >&2; echo #' \
  credential fill <<< $'url=https://github.com/ORG/REPO.git\n'
```

## 8. git이 helper를 부르는 순간 추적

git 내부에서 helper가 언제 실행되는지 본다.

```bash
GIT_TRACE=1 git clone https://github.com/ORG/REPO.git repo-trace
```

`run_command: 'git credential-ssm get'` 같은 줄이 보인다. 4단계 CodeBuild 실습에서 같은 방법을 쓴다.

`GIT_TRACE_CURL=1`은 HTTP 헤더까지 덤프하므로 Authorization 헤더에 토큰이 그대로 찍힌다. 실습 계정에서만 쓰고 로그를 남기지 않는다.

## 정리

```bash
cd terraform && terraform destroy
aws ssm delete-parameter --name "/git-credential-helper-lab/github-token"
```

토큰도 GitHub에서 폐기한다.
