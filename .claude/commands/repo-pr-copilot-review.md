---
description: PR에 GitHub Copilot code review를 요청한다. 이미 리뷰가 있으면 재요청한다
argument-hint: [PR 번호]
allowed-tools: Bash
---

PR `$1`(없으면 현재 branch의 PR)에 Copilot code review를 요청한다. 요청을 걸기만 하고 끝낸다. 올라온 리뷰를 읽지 않고 기다리지도 않는다.

## 순서

1. 대상 PR과 저장소를 확인한다.
2. 요청한다.
3. 요청이 걸린 것만 확인하고 끝낸다.

## 대상 확인

`$1`이 없으면 현재 branch의 PR을 쓴다.

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
PR=${1:-$(gh pr view --json number -q .number)}
```

## 요청

gh 2.88.0부터 `@copilot`을 reviewer로 직접 넘길 수 있다. 최초 요청과 재요청 모두 이 한 줄로 끝난다.

```bash
gh pr edit "$PR" --add-reviewer "@copilot"
```

## gh api로 직접 호출

gh가 2.88.0 미만이거나 API를 직접 써야 할 때 쓴다. Copilot은 `copilot-pull-request-reviewer[bot]` 계정으로 리뷰한다.

최초 요청은 일반 reviewer와 같은 REST endpoint로 된다.

```bash
gh api --method POST "repos/$REPO/pulls/$PR/requested_reviewers" \
  -f "reviewers[]=copilot-pull-request-reviewer[bot]"
```

재요청은 이 REST 호출로 안 된다. 200을 주고도 아무 일이 없다. 리뷰를 마친 reviewer는 REST로 다시 부를 수 없기 때문이다. GraphQL `requestReviewsByLogin`의 `botLogins`를 쓴다. `gh pr edit`이 내부에서 호출하는 것과 같은 mutation이다.

```bash
PR_ID=$(gh pr view "$PR" --json id -q .id)
gh api graphql -f pr="$PR_ID" -f query='
mutation($pr:ID!) {
  requestReviewsByLogin(input: {
    pullRequestId: $pr,
    botLogins: ["copilot-pull-request-reviewer[bot]"],
    union: true
  }) { clientMutationId }
}'
```

두 가지를 지킨다.

- `botLogins`에는 `[bot]` 접미사를 붙인다. `gh pr edit`은 자동으로 붙여 주지만 raw GraphQL은 아니다.
- `union: true`를 빼면 기존 reviewer가 전부 지워진다.

## 확인

요청이 걸리면 reviewRequests에 bot이 나타난다. 여기까지만 보고 끝낸다.

```bash
gh pr view "$PR" --json reviewRequests -q '.reviewRequests[].login'
```

## 주의

- 리뷰 본문을 조회하거나 polling하지 않는다. 올라온 comment를 읽고 고치는 것은 [/repo-pr-fix](./repo-pr-fix.md)가 한다.
- head commit이 그대로인 PR에 다시 요청하면 Copilot이 같은 내용을 다시 리뷰한다. 코드를 push한 뒤에 요청한다.
- 저장소나 조직에서 Copilot code review가 꺼져 있으면 요청이 422로 실패한다. 이때는 코드를 고치지 말고 설정 문제임을 알린다.
