#!/usr/bin/env bash
# agent 이미지를 arm64로 빌드해 ECR에 push한다. 사용법: scripts/push-image.sh [tag]
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tag="${1:-v1}"
repo="$(terraform -chdir="$workspace_dir/terraform" output -raw repository_url)"
registry="${repo%%/*}"
region="$(cut -d. -f4 <<<"$registry")"

aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry"
docker buildx build --platform linux/arm64 -t "$repo:$tag" --push "$workspace_dir/agent"
