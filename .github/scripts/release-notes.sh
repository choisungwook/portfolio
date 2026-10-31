#!/usr/bin/env bash
# Prints the "What's Changed" list of one product release: only the PRs whose
# commits touched that product's directory. GitHub's generated notes cannot do
# this in a monorepo; they list every PR since the last tag of any product.
#
# Usage: release-notes.sh <tag> <product path>
# Needs GH_TOKEN, GITHUB_REPOSITORY and GITHUB_SHA (all set inside Actions).
# Uses the API only, so a shallow checkout is enough.
set -euo pipefail

tag=$1
path=$2
repo=${GITHUB_REPOSITORY:?}
sha=${GITHUB_SHA:?}
# akbun-makephoto-v0.2.0 -> akbun-makephoto-v, tistory-1.2.1 -> tistory-
prefix=$(sed -E 's/[0-9][0-9.]*$//' <<<"$tag")

# Tags by name prefix, not the release list: that list is capped and this repo
# adds releases of every product to it.
prev=$(gh api --paginate "repos/$repo/git/matching-refs/tags/$prefix" --jq '.[].ref | ltrimstr("refs/tags/")' |
  grep -E "^${prefix}[0-9][0-9.]*$" | grep -vxF "$tag" | sort -V | tail -1 || true)

since_args=()
prev_sha=""
if [ -n "$prev" ]; then
  read -r prev_sha prev_date < <(gh api "repos/$repo/commits/$prev" --jq '.sha + " " + .commit.committer.date')
  since_args=(-f since="$prev_date")
fi

echo "## What's Changed"
gh api --method GET --paginate "repos/$repo/commits" -f path="$path" -f sha="$sha" -f per_page=100 ${since_args[@]+"${since_args[@]}"} \
  --jq ".[] | select(.sha != \"$prev_sha\") | .sha + \"\t\" + (.commit.message | split(\"\n\")[0])" |
  while IFS=$'\t' read -r c subject; do
    pr=$(gh api "repos/$repo/commits/$c/pulls" \
      --jq '[.[] | select(.merged_at)][0] // empty | "* \(.title) by @\(.user.login) in \(.html_url)"')
    echo "${pr:-* $subject (${c:0:7})}"
  done | awk '!seen[$0]++'

if [ -n "$prev" ]; then
  printf '\n**Full Changelog**: https://github.com/%s/compare/%s...%s\n' "$repo" "$prev" "$tag"
fi
