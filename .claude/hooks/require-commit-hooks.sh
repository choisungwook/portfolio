#!/bin/bash
# Check the native hooks before an agent asks Git to create a commit.
set -e -o pipefail

block() {
  printf 'Commit blocked: %s\n' "$1" >&2
  exit 2
}

input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input | (.command // .cmd // .input // empty)') ||
  block 'cannot read the tool command.'

flat=${command//$'\\\n'/ }
flat=$(printf '%s' "$flat" | tr '\n\t' '  ')
git_commit='(^|[[:space:];&|(/])git([[:space:]]+-[^[:space:];&|]+([[:space:]]+("[^"]*"|'\''[^'\'']*'\''|[^[:space:];&|]+))?)*[[:space:]]+commit([[:space:];&|)]|$)'
[[ "$flat" =~ $git_commit ]] || exit 0

bypass='[[:space:]](--no-verify|-[aqsv]*n[aqsvm]*)([[:space:];&|)]|$)'
override="(^|[[:space:]])(-c[[:space:]]*[\"']?core\.hookspath=|--config-env[=[:space:]]+[\"']?core\.hookspath=|git_config_(count|parameters)=)"
flat_lower=$(printf '%s' "$flat" | LC_ALL=C tr '[:upper:]' '[:lower:]')
if [[ "$flat" =~ $bypass || "$flat_lower" =~ $override ]]; then
  block 'run the commit with its privacy hooks enabled.'
fi

project_root=$(cd -P "$(dirname "$0")/../.." && pwd) || block 'cannot locate this project.'
for name in pre-commit commit-msg; do
  hook_path=$(git -C "$project_root" rev-parse --path-format=absolute --git-path "hooks/$name") ||
    block 'cannot resolve the Git hook path.'
  if ! [[ -x "$hook_path" && "$hook_path" -ef "$project_root/.githooks/$name" ]]; then
    block 'activate this repository’s hooks with git config --local core.hooksPath .githooks.'
  fi
done
