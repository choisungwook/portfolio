#!/usr/bin/env bash
# 같은 PromQL을 AMP나 CloudWatch에 보낸다. 서명 서비스 이름만 다르다(aps, monitoring).
# 사용: scripts/promql.sh amp|cw '<PromQL>'
# 조회하는 사람의 자격 증명(export AWS_PROFILE)으로 서명한다.
set -euo pipefail
cd "$(dirname "$0")/.."
AWS_REGION="$(terraform -chdir=terraform output -raw aws_region)"
AMP_QUERY_URL="$(terraform -chdir=terraform output -raw amp_query_url)"

case "$1" in
  amp) service=aps;        url="${AMP_QUERY_URL}api/v1/query" ;;
  cw)  service=monitoring; url="https://monitoring.${AWS_REGION}.amazonaws.com/api/v1/query" ;;
  *)   echo "usage: $0 amp|cw '<PromQL>'" >&2; exit 1 ;;
esac

body="query=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$2")"
uvx awscurl --service "$service" --region "$AWS_REGION" \
  -X POST -H "Content-Type: application/x-www-form-urlencoded" -d "$body" "$url"
