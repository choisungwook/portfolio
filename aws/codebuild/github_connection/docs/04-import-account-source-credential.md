# 계정 기본 source credential로 connection 등록하기

CodeBuild는 GitHub App connection을 account level source credential로 등록할 수 있습니다. 이 방식은 여러 project가 같은 기본 connection을 쓰게 만들 때 편하지만, 영향 범위가 project 단위 설정보다 넓습니다.

## TL;DR

- 새 계정이나 테스트 계정에서는 account level credential 등록이 단순합니다.
- 운영 project가 이미 많다면 먼저 [migration 문서](./migration.md)를 읽고 영향 범위를 확인합니다.
- `import-source-credentials`의 `--token`에는 직접 만든 connection ARN을 넣습니다.
- 등록 뒤에는 `list-source-credentials`로 `authType=CODECONNECTIONS`를 확인합니다.

## 등록하기

connection ARN을 환경 변수로 둡니다.

```shell
export GITHUB_CONNECTION_ARN="arn:aws:codeconnections:ap-northeast-2:123456789012:connection/00000000-0000-0000-0000-000000000000"
```

CodeBuild account source credential로 connection을 등록합니다.

```shell
aws codebuild import-source-credentials \
  --auth-type CODECONNECTIONS \
  --server-type GITHUB \
  --token "${GITHUB_CONNECTION_ARN}"
```

등록된 credential을 확인합니다.

```shell
aws codebuild list-source-credentials
```

`sourceCredentialsInfos`에 `serverType`이 `GITHUB`, `authType`이 `CODECONNECTIONS`인 항목이 보이면 등록된 상태입니다.

## 이 방식을 쓸 때의 판단 기준

account level credential의 장점은 project마다 connection ARN을 반복해서 지정하지 않아도 된다는 점입니다. 여러 project가 같은 GitHub App connection을 쓰는 구조라면 관리 지점이 줄어듭니다.

단점은 영향 범위가 넓다는 점입니다. 여러 project가 account level credential에 기대고 있다면 connection 권한 누락 하나가 여러 build 실패로 이어질 수 있습니다.

처음 실습에서는 project source에 connection을 직접 지정하는 방식을 먼저 권합니다. 그 다음 여러 project에 같은 connection을 적용해야 할 때 account level credential을 검토하는 순서가 이해하기 쉽습니다.

## 참고자료

- [AWS CodeBuild - GitHub App connections for GitHub and GitHub Enterprise Server](https://docs.aws.amazon.com/codebuild/latest/userguide/connections-github-app.html)
- [AWS CodeBuild - GitHub and GitHub Enterprise Server access token](https://docs.aws.amazon.com/codebuild/latest/userguide/access-tokens-github.html)
