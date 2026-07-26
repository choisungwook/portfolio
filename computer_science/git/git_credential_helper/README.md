# git credential helper

CodeBuild buildspec의 `git-credential-helper: yes` 한 줄로 private repo가 clone되는 이유를, git이 인증을 외부에 위임하는 구조부터 이해하기 위한 자료다.

임시 토큰이 발급된다는 사실 자체가 목표가 아니다. git이 어떤 모양의 위임 지점을 만들어 두었길래 AWS가 git을 고치지 않고 그 자리에 끼어들 수 있었는지, 그 결과 보안 리스크가 어디로 옮겨갔는지, 같은 문제를 다른 도구는 어떻게 푸는지를 본다.

## 어디부터 볼 것인가

[docs/study-plan.md](./docs/study-plan.md)가 학습 순서다. 네 단계로 나뉜다.

| 단계 | 내용 | 자료 |
|---|---|---|
| 1 | git이 자격증명을 찾는 순서와 config 누적 규칙 | [study-plan.md](./docs/study-plan.md) |
| 2 | helper가 실제로 무엇을 대신해 주는가, 단명 토큰용 속성 | [study-plan.md](./docs/study-plan.md) |
| 3 | EC2에서 파일·환경변수를 하나씩 관찰하고 custom helper 만들기 | [ec2-lab/](./ec2-lab/) |
| 4 | CodeBuild 빌드 안에서 helper 동작 조회 | [codebuild-lab/](./codebuild-lab/) |

학습지 [studysheet-git-credential-helper-v4.html](./studysheet-git-credential-helper-v4.html)은 브라우저로 열어 페이지를 넘기며 읽는다. 외부 라이브러리 없이 파일 하나로 동작한다. 위 네 단계를 19장으로 압축한 것이므로, 학습 계획을 먼저 읽고 학습지로 넘어가면 된다.

## 실습 두 개

**[ec2-lab/](./ec2-lab/)** — 빈 EC2 인스턴스에서 git 인증을 관찰한다. URL에 토큰을 박았을 때 어디에 남는지, store helper가 만드는 평문 파일, cache helper의 소켓, 그리고 토큰을 디스크에 두지 않고 호출 때마다 SSM에서 가져오는 custom helper를 직접 만들어 본다. 로컬 머신에서 하지 않는 이유는 기존 키체인 helper와 `~/.gitconfig`가 관찰을 오염시키기 때문이다.

**[codebuild-lab/](./codebuild-lab/)** — CodeBuild 빌드 안에서 helper의 정체와 동작을 조회한다. helper는 소스가 공개되어 있지 않으므로 `git config --show-origin`, helper 직접 호출, `GIT_TRACE`, 프로세스·포트 관찰이 유일한 수단이다. `git-credential-helper: yes`만으로는 두 번째 repo clone이 실패하는 이유(path 스코프)와 우회 방법도 여기서 다룬다.

## 미리 알아 둘 사실

`GetConnectionToken`은 IAM action으로는 존재하지만 공개 API와 CLI에는 없다. 사람이 직접 호출해 CodeConnections 토큰을 받을 수 없고, 빌드 안의 helper를 통해서만 나온다. 그래서 EC2 실습은 CodeConnections 대신 다른 토큰 소스를 쓴다.

## 디렉터리

| 경로 | 설명 |
|---|---|
| `docs/` | 학습 순서와 각 단계에서 확인할 것 |
| `ec2-lab/terraform/` | SSM으로 접속하는 EC2와 custom helper |
| `codebuild-lab/terraform/` | CodeConnections connection, CodeBuild project, IAM role |
| `codebuild-lab/examples/` | GitHub private repo a와 b에 넣을 buildspec과 스크립트 |
