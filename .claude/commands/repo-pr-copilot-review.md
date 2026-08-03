---
description: PR에 GitHub Copilot code review를 요청한다. 이미 리뷰가 있으면 재요청한다
argument-hint: [PR 번호]
allowed-tools: Bash
---

PR `$1`(없으면 현재 branch의 PR)에 Copilot code review를 요청한다.

## 순서

1. 대상 PR과 저장소를 확인한다.
2. 이미 Copilot 리뷰가 있는지 확인한다.
3. 없으면 최초 요청, 있으면 재요청을 한다.
4. 요청이 걸렸는지 확인하고 사용자에게 알린다.

## 대상 확인

`$1`이 없으면 현재 branch의 PR을 쓴다.

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
PR=${1:-$(gh pr view --json number -q .number)}
```

## 최초 요청

Copilot은 `copilot-pull-request-reviewer[bot]` 계정으로 리뷰한다. 일반 reviewer와 같은 REST endpoint를 쓴다.

```bash
gh api --method POST "repos/$REPO/pulls/$PR/requested_reviewers" \
  -f "reviewers[]=copilot-pull-request-reviewer[bot]"
```

gh가 최신이면 아래 한 줄로도 된다. 실패하면 위 REST 호출로 넘어간다.

```bash
gh pr edit "$PR" --add-reviewer "@copilot"
```

## 재요청

Copilot이 이미 리뷰를 남긴 PR에는 위 REST 호출이 200을 주고도 아무 일이 없다. 리뷰가 끝난 reviewer는 REST로 다시 부를 수 없기 때문이다. 이때는 GraphQL `requestReviews`의 `botIds`를 쓴다. REST와 gh CLI 어디에도 노출되지 않는 필드다.

bot의 node id는 하드코딩하지 않고 기존 리뷰에서 꺼낸다. 재요청이 필요한 상황이면 이미 리뷰가 있으므로 항상 찾을 수 있다.

```bash
gh api graphql -F owner="${REPO%/*}" -F name="${REPO#*/}" -F number="$PR" -f query='
query($owner:String!, $name:String!, $number:Int!) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) {
      id
      reviews(first:100) {
        nodes { author { __typename ... on Bot { id login } } }
      }
    }
  }
}'
```

`login`이 `copilot-pull-request-reviewer`인 노드의 `id`와 pullRequest의 `id`로 재요청한다. `union: true`를 빼면 기존 reviewer가 전부 지워지므로 반드시 넣는다.

```bash
gh api graphql -f pr="$PR_NODE_ID" -f bot="$BOT_NODE_ID" -f query='
mutation($pr:ID!, $bot:ID!) {
  requestReviews(input: {pullRequestId: $pr, botIds: [$bot], union: true}) {
    pullRequest { id }
  }
}'
```

## 확인

요청이 걸리면 reviewRequests에 bot이 나타난다.

```bash
gh pr view "$PR" --json reviewRequests -q '.reviewRequests[].login'
```

리뷰 본문이 올라오기까지 몇 분 걸린다. 결과는 아래로 본다.

```bash
gh api "repos/$REPO/pulls/$PR/reviews" \
  --jq '.[] | select(.user.login == "copilot-pull-request-reviewer[bot]") | .submitted_at'
```

## 주의

- 이 command는 리뷰를 요청하기만 한다. 올라온 comment를 읽고 고치는 것은 [/repo-pr-fix](./repo-pr-fix.md)가 한다.
- 요청 후 리뷰를 기다리며 polling하지 않는다. 요청을 걸고 확인 명령을 안내한 뒤 끝낸다.
- 저장소나 조직에서 Copilot code review가 꺼져 있으면 REST 호출이 422로 실패한다. 이때는 코드를 고치지 말고 설정 문제임을 알린다.
