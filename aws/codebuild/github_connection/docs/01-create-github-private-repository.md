# GitHub private repository 만들기

CodeBuild GitHub App connection을 확인하려면 private repository가 하나 필요합니다. 이 핸즈온에서는 CodeBuild가 private repository를 source로 clone할 수 있는지 확인합니다.

## GitHub console에서 private repository 만들기

GitHub에서 실습용 private repository를 만듭니다.

1. GitHub에서 `New repository`를 선택합니다.
2. repository owner를 선택합니다.
3. repository 이름을 입력합니다. 예시는 `codebuild-private-clone-test`입니다.
4. visibility를 `Private`로 선택합니다.
5. `Add a README file`을 선택합니다.
6. `Create repository`를 선택합니다.

README를 만들면 기본 branch와 첫 commit이 생깁니다. CodeBuild가 clone한 뒤 `git rev-parse`로 commit을 확인할 수 있습니다.

## Clone URL 확인하기

repository 화면에서 `Code` 버튼을 누르고 HTTPS URL을 복사합니다.

```text
https://github.com/owner/codebuild-private-clone-test.git
```

이 URL을 Terraform 변수 `github_repository_url`에 넣습니다. 이 값은 CodeBuild project의 `source.location`에 들어갑니다.

```hcl
github_repository_url = "https://github.com/owner/codebuild-private-clone-test.git"
```

## 어디에 권한이 붙는가

헷갈리기 쉬운 지점은 repository URL과 인증의 위치입니다.

| 값 | 어디에 설정하는가 | 역할 |
| --- | --- | --- |
| repository URL | CodeBuild project `source.location` | 어떤 repository를 clone할지 지정 |
| connection ARN | CodeBuild project `source.auth.resource` | 그 repository에 접근할 인증 경로 지정 |
| repository access | GitHub App installation | GitHub App이 접근 가능한 repository 범위 지정 |

따라서 private repository 주소는 GitHub에서 복사합니다. CodeBuild는 그 주소를 source로 사용하고, connection은 그 주소에 접근할 권한을 제공합니다.

## 참고자료

- [GitHub Docs - Creating a new repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
- [AWS CodeBuild - GitHub App connections for GitHub and GitHub Enterprise Server](https://docs.aws.amazon.com/codebuild/latest/userguide/connections-github-app.html)
