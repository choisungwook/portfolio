#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 2 ]] || { echo 'Usage: start-pipeline.sh PIPELINE IMAGE_TAG' >&2; exit 1; }
pipeline=$1
image_tag=$2
variables=$(jq -n --arg tag "$image_tag" '[{name: "IMAGE_TAG", value: $tag}]')
aws codepipeline start-pipeline-execution --name "$pipeline" --variables "$variables" \
  --region "${AWS_DEFAULT_REGION:-ap-northeast-2}" --output json
