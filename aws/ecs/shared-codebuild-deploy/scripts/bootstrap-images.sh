#!/usr/bin/env bash
set -euo pipefail

lab_directory=$(cd "$(dirname "$0")/.." && pwd)
foundation=$(terraform -chdir="$lab_directory/foundation" output -json lab)
region=$(jq -r '.aws_region' <<< "$foundation")
repository=$(jq -r '.repository_name' <<< "$foundation")
repository_url=$(jq -r '.repository_url' <<< "$foundation")
registry=${repository_url%%/*}
error_file=$(mktemp)
trap 'rm -f "$error_file"' EXIT

aws ecr get-login-password --region "$region" |
  docker login --username AWS --password-stdin "$registry"

for tag in v1 v2; do
  if aws ecr describe-images --region "$region" --repository-name "$repository" \
    --image-ids "imageTag=$tag" --output json > /dev/null 2> "$error_file"; then
    echo "$tag already exists; skipped"
    continue
  fi
  if ! grep -q 'An error occurred (ImageNotFoundException)' "$error_file"; then
    cat "$error_file" >&2
    exit 1
  fi
  docker buildx build --platform linux/amd64 --provenance=false --load \
    --build-arg "IMAGE_VERSION=$tag" --tag "$repository_url:$tag" "$lab_directory/app"
  docker push "$repository_url:$tag"
done
