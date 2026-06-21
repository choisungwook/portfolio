# PAT에서 GitHub App connection으로 옮길 때의 위험

AWS CodeBuild에서 이미 GitHub Personal Access Token(PAT)을 쓰고 있다면 GitHub App connection으로 바로 바꾸기보다 우선순위를 이용해서 점진적으로 옮기는 편이 안전합니다. 이 글에서는 기존 PAT를 유지한 상태에서 새 connection을 붙이고, 검증이 끝난 뒤 PAT 의존을 줄이는 순서로 정리합니다.

## TL;DR

- 중단 없는 전환의 1순위는 project별 custom source credential입니다.
- account 기본 PAT는 바로 지우지 말고, 한 project에서 GitHub App connection을 먼저 검증합니다.
- project별 credential은 account 기본 credential을 override하므로 canary 전환에 적합합니다.
- account 기본 credential을 바꾸는 방식은 영향 범위가 넓어서 조용한 시간대와 rollback 절차가 필요합니다.
- 실행 중인 build가 project update 이후 어떤 credential snapshot을 쓰는지는 실제 계정에서 확인 필요입니다.

## 우선순위로 중단 없이 옮기는 방법

CodeBuild console은 GitHub source credential을 고를 때 account default credential과 project 전용 custom source credential을 구분합니다. AWS 문서도 custom source credential을 account default 설정을 override하는 방식으로 설명합니다.

이 우선순위를 이용하면 account 기본 PAT를 그대로 둔 상태에서 특정 project만 GitHub App connection으로 바꿀 수 있습니다.

1. GitHub App connection을 새로 만듭니다.
2. connection 상태가 `AVAILABLE`인지 확인합니다.
3. CodeBuild project role에 connection 사용 권한을 추가합니다.
4. 낮은 위험의 project 하나만 `source.auth.type = CODECONNECTIONS`와 connection ARN으로 바꿉니다.
5. 수동 build를 실행해서 clone, build log, webhook, status report를 확인합니다.
6. 같은 방식으로 project를 하나씩 옮깁니다.
7. 더 이상 PAT를 쓰는 project가 없다는 것을 확인한 뒤 PAT source credential을 삭제합니다.

이 방법의 장점은 기존 account 기본 PAT를 건드리지 않는다는 점입니다. 문제가 생기면 해당 project의 `source.auth`를 이전 상태로 되돌리면 됩니다.

단점은 project마다 설정을 바꿔야 한다는 점입니다. project 수가 많으면 전환 시간이 길어지고, 일부 project만 다른 credential을 쓰는 기간이 생깁니다.

## 바로 account 기본 credential을 바꿀 때의 위험

account 기본 credential을 PAT에서 GitHub App connection으로 바꾸면 설정 위치는 단순해집니다. 하지만 그 credential을 기본값으로 쓰던 모든 project가 한 번에 영향을 받을 수 있습니다.

장점은 관리 지점이 하나라는 점입니다. 새 project가 기본적으로 GitHub App connection을 쓰게 만들기 쉽습니다.

단점은 실패 반경이 넓다는 점입니다. connection의 repository access, webhook permission, CodeBuild role IAM permission 중 하나라도 빠지면 여러 project가 동시에 clone 실패를 겪을 수 있습니다.

account 기본 credential을 바꿔야 한다면 다음 순서로 중단을 줄입니다.

1. `aws codebuild list-source-credentials`로 현재 credential 목록을 저장합니다.
2. `aws codebuild batch-get-projects`로 GitHub source를 쓰는 project 목록을 저장합니다.
3. GitHub App connection이 모든 대상 repository에 접근 가능한지 확인합니다.
4. 새 connection을 쓰는 테스트 project를 먼저 성공시킵니다.
5. webhook을 쓰는 project는 이벤트가 적은 시간대에 전환합니다.
6. 전환 직후 대표 project에서 수동 build를 실행합니다.
7. 실패하면 account credential을 이전 PAT 방식으로 되돌립니다.

현재 credential 목록을 확인하는 명령입니다.

```shell
aws codebuild list-source-credentials
```

PAT credential을 지울 때는 ARN을 정확히 확인한 뒤 삭제합니다. 이 작업은 되돌릴 수 있는 설정 변경이 아니라 credential 삭제입니다.

```shell
aws codebuild delete-source-credentials \
  --arn arn:aws:codebuild:ap-northeast-2:123456789012:token/github
```

## 전환 전에 확인할 것

GitHub App connection은 PAT보다 secret 노출 시간이 짧지만, connection 자체는 장기 리소스입니다. 그래서 IAM과 GitHub App installation 권한을 함께 좁혀야 합니다.

- GitHub App installation이 필요한 repository만 허용하는지 확인합니다.
- CodeBuild project role이 필요한 connection ARN에만 접근하는지 확인합니다.
- `codeconnections:GetConnection`, `codeconnections:GetConnectionToken`, `codeconnections:UseConnection` 권한을 실제 build와 webhook 생성 기준으로 검증합니다.
- webhook을 쓰면 GitHub App에 webhook permission이 있는지 확인합니다.
- `codeconnections` ARN과 예전 `codestar-connections` ARN을 섞지 않습니다.
- CodeConnections region이 CodeBuild region과 맞는지 확인합니다.

## Rollback 기준

project별 전환에서 문제가 생기면 해당 project의 source auth를 이전 credential 방식으로 되돌립니다. account 기본 PAT를 지우지 않았다면 rollback 범위는 한 project에 머뭅니다.

account 기본 credential 전환에서 문제가 생기면 바로 이전 PAT credential을 다시 등록합니다. 이때 PAT 권한이 만료되었거나 삭제되었으면 rollback이 늦어집니다. 그래서 전환 창이 끝날 때까지 기존 PAT를 보관하는 편이 안전합니다.

확인 필요: 실행 중인 build가 project 설정 변경 후에도 시작 시점의 credential을 계속 쓰는지, 아니면 provider token 갱신 시점에 새 설정의 영향을 받는지는 실제 계정에서 확인해야 합니다. 보수적으로는 실행 중인 build가 없을 때 credential 전환을 수행합니다.

## 참고자료

- [AWS CodeBuild - GitHub App connections for GitHub and GitHub Enterprise Server](https://docs.aws.amazon.com/codebuild/latest/userguide/connections-github-app.html)
- [AWS CodeBuild - GitHub and GitHub Enterprise Server access token](https://docs.aws.amazon.com/codebuild/latest/userguide/access-tokens-github.html)
- [AWS CodeBuild API - SourceAuth](https://docs.aws.amazon.com/codebuild/latest/APIReference/API_SourceAuth.html)
- [AWS CodeConnections - Actions, resources, and condition keys](https://docs.aws.amazon.com/service-authorization/latest/reference/list_awscodeconnections.html)
