# akbun-terraform-apply-remote

GitHub pull request에서 terraform plan/apply를 실행하는 셀프호스팅 자동화 서버다. Atlantis와 같은 방식으로 동작한다. PR이 열리면 변경된 terraform 프로젝트를 자동으로 plan하고, 리뷰어가 comment로 `akbun apply`를 남기면 리뷰한 plan 파일을 그대로 apply한다.

## 동작 방식

1. GitHub webhook(`issue_comment`, `pull_request`)을 받는다. HMAC-SHA256 서명을 검증한다.
2. PR이 열리거나 갱신되면 변경된 파일에서 terraform 프로젝트 디렉터리를 찾아 자동으로 plan한다.
3. plan 결과를 PR comment로 남기고, plan 파일(`.akbun.tfplan`)을 저장한다.
4. `akbun apply` comment를 받으면 저장된 plan 파일을 apply한다. plan 이후 PR head가 바뀌었으면 거부하고 재plan을 요구한다.
5. 프로젝트 디렉터리 단위 lock으로 여러 PR이 같은 state를 동시에 건드리는 것을 막는다.

## 문서

- 설치와 사용법: [docs/user-guide.md](./docs/user-guide.md)

## 개발

빌드와 테스트:

```bash
cargo test
cargo build --release
```

핵심 로직(comment 명령 파싱, webhook 서명 검증, 프로젝트 탐지, comment 포맷, lock)은 단위 테스트로 검증한다. 소스는 AI agent가 유지보수하는 것을 전제로 작성했다.
