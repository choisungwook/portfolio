#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
profile="${AWS_PROFILE:-default}"
credentials="$(aws configure export-credentials --profile "$profile")"
gateway_url="$(terraform -chdir="$workspace_dir/terraform" output -raw gateway_url)"
aws_region="$(terraform -chdir="$workspace_dir/terraform" output -raw aws_region)"

jq -r --arg gateway_url "$gateway_url" --arg aws_region "$aws_region" '
  "AWS_ACCESS_KEY_ID=\(.AccessKeyId)",
  "AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey)",
  "AWS_SESSION_TOKEN=\(.SessionToken)",
  "AGENTCORE_GATEWAY_URL=\($gateway_url)",
  "AWS_REGION=\($aws_region)"
' <<<"$credentials" >"$workspace_dir/.runtime.env"

chmod 600 "$workspace_dir/.runtime.env"
