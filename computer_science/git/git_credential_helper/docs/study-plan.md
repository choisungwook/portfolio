# git credential helper 학습 계획

목표는 CodeBuild buildspec의 `git-credential-helper: yes` 한 줄로 private repo가 clone되는 이유를 원리 수준에서 이해하는 것이다. 임시 토큰이 발급된다는 사실 자체가 아니라, git이 인증을 외부에 위임하는 구조가 어떻게 생겼길래 AWS가 그 자리에 끼어들 수 있었는지를 본다.

학습 순서는 아래 네 단계다. 앞 단계를 건너뛰면 뒤 단계에서 관찰한 것을 해석할 수 없다.

## 1단계. git이 자격증명을 찾는 순서

먼저 알아야 할 것은 "credential helper가 무엇인가"가 아니라 "git이 인증이 필요할 때 무엇을 어떤 순서로 보는가"다. helper는 그 순서 안의 한 자리일 뿐이다.

[git 공식 문서](https://git-scm.com/docs/gitcredentials) 기준 순서는 다음과 같다.

1. URL에 자격증명이 들어 있으면 그것을 쓴다. `https://user:token@github.com/org/repo.git`
2. config의 `credential.<url>.username` 같은 값으로 아는 항목을 채운다.
3. `credential.helper`에 등록된 helper를 등록 순서대로 `get`으로 호출한다.
   - username과 password가 모두 채워지면 남은 helper는 호출하지 않는다.
   - helper가 `quit=true`를 출력하면 즉시 중단한다. 이후 helper도, 사용자 프롬프트도 없다.
4. 여기까지 못 채우면 `GIT_ASKPASS` → `core.askPass` → `SSH_ASKPASS` → 터미널 프롬프트 순으로 사람에게 묻는다.
5. 인증 결과를 다시 helper에게 알린다. 성공이면 `store`, 실패(401)면 `erase`를 **등록된 모든 helper**에 보낸다.

여기서 자주 놓치는 두 가지가 CodeBuild 동작을 읽을 때 그대로 필요하다.

- **helper 목록은 누적된다.** `/etc/gitconfig` → `~/.gitconfig` → `.git/config` → `-c` 순으로 쌓인다. `credential.helper`에 빈 값을 주면 그때까지 쌓인 목록이 리셋된다.
- **매칭 단위는 기본이 host다.** protocol과 host가 정확히 일치해야 하고 path는 보지 않는다. `credential.useHttpPath=true`를 켜야 repo path까지 구분한다.

이 단계의 확인 질문은 이렇다. 지금 이 머신에서 `git clone`이 비밀번호를 묻지 않는다면, 위 1~4 중 어디서 채워진 것인가.

## 2단계. helper가 실제로 무엇을 해 주는가

helper는 "자격증명을 저장해 주는 프로그램"이 아니다. **git과 key=value 텍스트로 대화하는 외부 프로그램**이고, 그 안에서 무엇을 하든 git은 관여하지 않는다. 그래서 파일에서 읽어도 되고, 키체인을 열어도 되고, 그 자리에서 새 토큰을 발급받아도 된다. CodeBuild가 끼어들 수 있었던 이유가 이것이다.

규약은 세 가지뿐이다.

- 인자는 `get`, `store`, `erase` 중 하나.
- stdin으로 `protocol`, `host`, (useHttpPath면) `path`를 받는다.
- stdout으로 `username`, `password`를 돌려준다. 줄 게 없으면 아무것도 출력하지 않는다.

단명 토큰을 다루는 도구를 위해 규약에 추가된 속성들도 같이 보면 좋다. 이것들이 "다른 도구는 이 문제를 어떻게 풀었나"의 답이다.

| 속성 | 의미 |
| --- | --- |
| `password_expiry_utc` | 이 자격증명이 언제 만료되는지 git에게 알린다 |
| `ephemeral` | 저장하지 말라는 표시. 단명 토큰용 |
| `oauth_refresh_token` | OAuth refresh token을 함께 전달 |
| `authtype`, `credential` | basic 외의 인증 스킴(bearer 등)을 그대로 넘긴다 |
| `wwwauth[]` | 서버가 보낸 WWW-Authenticate 헤더를 helper에게 전달 |

git은 인증 방식이 늘어날 때마다 git 본체를 고치는 대신, 이 텍스트 규약에 필드를 늘리는 쪽을 택했다. 이 판단이 이 학습의 핵심 교훈이다.

## 3단계. EC2에서 파일과 환경변수를 하나씩 확인

읽어서 아는 것과 관찰해서 아는 것은 다르다. EC2 인스턴스 하나를 띄우고 1~2단계에서 읽은 것을 직접 확인한다. 절차는 [ec2-lab/README.md](../ec2-lab/README.md)에 있다.

확인하는 것은 다음과 같다.

- git이 실제로 읽은 config 파일이 무엇인지 (`git config --list --show-origin --show-scope`)
- URL에 토큰을 박았을 때 그 토큰이 어디에 남는지 — 이것이 첫 번째 보안 리스크다
- `store` helper가 만드는 `~/.git-credentials`의 내용과 권한
- `cache` helper가 만드는 소켓과 데몬 프로세스
- 토큰을 디스크에 두지 않고 호출될 때마다 외부(SSM)에서 가져오는 custom helper를 직접 만들어 보기
- helper를 두 개 걸었을 때 호출 순서, 빈 값 리셋, `useHttpPath`의 효과

3단계의 custom helper가 CodeBuild helper와 같은 구조다. 차이는 토큰을 어디서 가져오느냐(IAM으로 SSM에서 vs 빌드 agent에서)뿐이다. 여기까지 하면 4단계는 관찰만 남는다.

## 4단계. CodeBuild 내부 동작 조회

CodeBuild helper는 소스가 공개되어 있지 않다. 그래서 **빌드 안에서 관찰**하는 것이 유일한 방법이다. buildspec에 조회 명령을 넣고 로그로 확인한다. 절차는 [codebuild-lab/README.md](../codebuild-lab/README.md)에 있다.

조회 수단은 네 가지다.

1. **git 설정 관찰** — `git config --list --show-origin | grep -i credential`. CodeBuild가 무엇을 심었는지 그대로 보인다.
2. **helper 직접 호출** — helper는 그냥 실행 파일이므로 git 없이 손으로 호출할 수 있다. 어떤 입력에 무엇을 돌려주는지 실험할 수 있다.
3. **git 추적** — `GIT_TRACE=1`로 git이 helper를 실행하는 순간을 로그로 본다. `GIT_TRACE_CURL`은 헤더에 토큰이 찍히므로 실습 계정에서만 쓴다.
4. **파일과 프로세스 관찰** — `ls -la /codebuild/readonly/bin/`, `file`, `ps`, `ss -tlnp`로 helper의 정체와 통신 대상을 확인한다.

여기서 확인해야 할 사실이 하나 있다. **토큰 발급 API인 `GetConnectionToken`은 IAM action으로는 존재하지만 공개 API/CLI에는 없다.** CodeConnections CLI에는 `get-connection`, `list-connections`는 있어도 `get-connection-token`은 없다. 즉 이 토큰은 사용자가 직접 호출해서 받을 수 없고, 빌드 안의 helper를 통해서만 나온다. 그래서 3단계 EC2 실습에서는 CodeConnections 대신 다른 토큰 소스를 쓴다.

## 무엇을 얻어야 하는가

이 학습이 끝났을 때 남아야 하는 것은 CodeBuild 사용법이 아니라 아래 세 가지다.

- **위임 지점의 모양** — git은 비밀을 다루는 책임을 밖으로 밀어내고, 인터페이스만 남겼다. 그래서 AWS는 git을 고치지 않고도 끼어들 수 있었다.
- **보안 리스크의 위치** — 토큰이 어디에 남는지가 리스크를 결정한다. URL에 박으면 config와 로그에 남고, store helper는 평문 파일에 남고, 호출 시점에 발급하면 아무 데도 남지 않는다. 대신 발급 권한이 IAM으로 이동한다. 리스크가 사라지는 게 아니라 옮겨간다.
- **일반화** — docker의 `docker-credential-*`, kubectl의 exec credential plugin이 정확히 같은 모양이다. 다음에 비슷한 문제를 만나면 "이 도구에 위임 지점이 있는가, 없으면 어디에 만들 수 있는가"를 먼저 묻게 된다.
