# CodeBuild helper 내부 동작 조회하기

[학습 계획](../docs/study-plan.md) 4단계 실습이다. `git-credential-helper: yes`를 켰을 때 CodeBuild가 빌드 컨테이너에 무엇을 심는지, 그 helper가 토큰을 어디서 가져오는지를 빌드 안에서 관찰한다.

CodeBuild helper는 소스가 공개되어 있지 않다. 그래서 조회 수단은 관찰뿐이다. [EC2 실습](../ec2-lab/README.md)에서 helper 규약을 손에 익힌 뒤에 하는 것이 좋다. 규약을 모르면 관찰 결과를 해석할 수 없다.

> 아래 buildspec과 명령은 AWS 문서와 공개된 분석 자료를 근거로 작성했고, 이 저장소에서 실행해 검증하지는 않았다.

## 조회용 buildspec

repo a 루트에 넣고 빌드를 돌린 뒤 로그를 읽는다.

```yaml
version: 0.2

env:
  git-credential-helper: yes

phases:
  build:
    commands:
      # 1. CodeBuild가 심은 git 설정을 출처와 함께 본다
      - git config --list --show-origin --show-scope | grep -i credential

      # 2. helper의 정체를 확인한다. 셸 스크립트인지 바이너리인지
      - ls -la /codebuild/readonly/bin/
      - file /codebuild/readonly/bin/git-credential-helper

      # 3. helper를 git 없이 직접 호출한다. source repo path로 물어본다
      - printf 'protocol=https\nhost=github.com\npath=ORG/a.git\n\n' | /codebuild/readonly/bin/git-credential-helper get | sed 's/^password=.\{8\}.*/password=<masked>/'

      # 4. 같은 helper에 다른 repo path로 물어본다. 응답이 달라지는지 본다
      - printf 'protocol=https\nhost=github.com\npath=ORG/b.git\n\n' | /codebuild/readonly/bin/git-credential-helper get || echo "second repo path failed"

      # 5. helper가 통신하는 대상을 찾는다
      - env | grep -i codebuild | cut -d= -f1
      - (ss -tlnp || netstat -tlnp) 2>/dev/null | head -20

      # 6. git이 helper를 실행하는 순간을 추적한다
      - GIT_TRACE=1 git clone --depth 1 https://github.com/ORG/b.git 2>&1 | head -40
```

토큰 값 자체는 로그에 남기지 않는다. 위 3번처럼 앞 몇 글자만 남기거나 마스킹한다. `ghs_`로 시작하면 GitHub App installation token이다.

## 읽는 법

**1번에서 보게 되는 것.** CodeBuild가 심는 설정은 세 줄이다.

```text
credential.usehttppath=true
credential.helper=
credential.helper=/codebuild/readonly/bin/git-credential-helper
```

빈 값 한 줄이 앞에 있는 이유는 helper 목록이 누적되기 때문이다. 빌드 이미지에 이미 helper가 있었다면 그것을 지우고 자기 것만 남기려는 것이다. `usehttppath=true`는 helper 조회 단위를 host에서 repo path로 바꾼다. 이 두 줄이 3번과 4번의 결과 차이를 만든다.

**3번과 4번의 차이가 이 실습의 핵심이다.** source repo path로 물으면 토큰이 나오고, 다른 repo path로 물으면 나오지 않는다. helper가 path별로 응답을 다르게 한다는 뜻이고, 실패했을 때 나오는 메시지가 단서다.

```text
Error retrieving Git credentials.error code 400: GITHUB Git credential unavailable.
```

400을 낸 주체가 GitHub이 아니라 CodeBuild 쪽이다. 요청이 GitHub까지 가지도 못했다. installation 권한 문제라면 GitHub이 403이나 404를 준다. **에러를 낸 주체를 구분하는 것이 디버깅의 출발점이다.**

**5번과 6번.** helper가 토큰을 파일로 갖고 있지 않다면 어디선가 받아오는 것이다. 환경변수 이름과 열려 있는 로컬 포트에서 통신 대상을 추정할 수 있다. 공개된 분석에서는 빌드 컨테이너 안의 agent가 `localhost:7831`에 떠 있고 helper가 여기에 묻는 것으로 보고되어 있다. 내부 구현이므로 예고 없이 바뀔 수 있다.

## 조회할 수 없는 것

`GetConnectionToken`은 IAM action으로는 존재하지만 **공개 API와 CLI에는 없다.** `aws codeconnections` 명령에는 `get-connection`, `list-connections`는 있어도 토큰을 받는 명령이 없다. 즉 이 토큰은 사람이 직접 호출해서 받을 수 없고 빌드 안의 helper를 통해서만 나온다.

이것을 확인해 두면 두 가지가 정리된다.

- EC2에서 CodeConnections 토큰으로 실습하는 것은 불가능하다. 그래서 3단계 실습은 다른 토큰 소스를 쓴다.
- IAM 권한(`codeconnections:GetConnectionToken`)은 빌드가 helper를 통해 토큰을 받을 때 서비스가 대신 쓰는 권한이다. 사람이 그 권한으로 토큰을 꺼내 갈 수는 없다.

## 두 번째 repo를 clone하려면

path 스코프 때문에 helper만 켜서는 두 번째 repo가 clone되지 않는다. 해법은 source repo path로 토큰을 한 번 꺼내 재사용하는 것이다. 이때 쓰는 것이 EC2 실습 7번에서 확인한 두 규칙, 즉 빈 값으로 helper 목록을 리셋하는 것과 `useHttpPath`를 되돌리는 것이다.

동작하는 형태는 [examples/repo-a/scripts/setup-git-credential.sh](./examples/repo-a/scripts/setup-git-credential.sh)에 있다. 이 스크립트를 `pre_build`에서 한 번 실행하면 이후 명령은 평범한 `git clone`으로 되돌아간다.

토큰이 installation access token이라 같은 installation에 속한 다른 repo에도 유효하다는 점이 이 우회가 성립하는 근거다. 바꿔 말하면 **토큰의 권한 범위는 조직에 설치된 AWS Connector for GitHub가 허용받은 repository 전체**다. 두 번째 repo를 clone하려고 connector에 repo를 추가하면 그 조직의 다른 CodeBuild project도 같은 repo에 접근할 수 있게 된다. 편의의 대가가 여기에 있다.

## 배포와 실행

repo 두 개를 준비한다. repo a에는 [examples/repo-a/](./examples/repo-a/)를, repo b에는 [examples/repo-b/](./examples/repo-b/)를 넣는다.

```bash
cd terraform && cp terraform.tfvars.example terraform.tfvars
```

조직과 repo 이름을 채우고 배포한다.

```bash
terraform init && terraform apply
```

`terraform apply` 직후 connection은 PENDING이다. AWS console의 Developer Tools > Settings > Connections에서 GitHub authorization을 끝내고 AWS Connector for GitHub를 설치한다. 설치할 때 repo a와 b를 모두 선택한다.

빌드를 실행하고 로그를 본다.

```bash
aws codebuild start-build --project-name "$(terraform output -raw codebuild_project_name)"
```

```bash
aws logs tail "$(terraform output -raw codebuild_log_group_name)" --follow
```

## 권한 범위 확인

installation 스코프를 눈으로 확인한다. GitHub 조직 설정에서 AWS Connector for GitHub의 selected repositories에서 repo b만 제거하고 빌드를 다시 돌린다. buildspec도 스크립트도 바꾸지 않았는데 clone이 실패하고, 이번에는 400이 아니라 GitHub의 403이나 404가 나온다. 실패 주체가 달라지는 것이 스코프가 어디서 걸리는지 보여 준다.

## 정리

```bash
terraform destroy
```

GitHub 조직에 설치된 AWS Connector for GitHub는 GitHub 쪽 리소스라 남는다. 필요하면 조직 설정에서 직접 제거한다.
