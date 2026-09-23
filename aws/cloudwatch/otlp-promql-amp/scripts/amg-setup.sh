#!/usr/bin/env bash
# AMG에 datasource 2개(AMP, CloudWatch PromQL)와 비교 대시보드를 넣는다.
# 1시간짜리 service account token을 발급해 Grafana API를 부르고, 끝나면 service account째 지운다.
# token은 파일이나 terraform state에 남기지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! ws="$(terraform -chdir=terraform output -raw amg_workspace_id 2>/dev/null)"; then
  echo "AMG workspace가 없습니다. terraform 변수 grafana = \"amg\"로 apply한 뒤 실행합니다." >&2
  exit 1
fi
url="$(terraform -chdir=terraform output -raw amg_url)"
amp_url="$(terraform -chdir=terraform output -raw amp_query_url)"
region="$(terraform -chdir=terraform output -raw aws_region)"

sa="$(aws grafana create-workspace-service-account --workspace-id "$ws" \
  --grafana-role ADMIN --name "setup-$(date +%s)" --query id --output text)"
trap 'aws grafana delete-workspace-service-account --workspace-id "$ws" --service-account-id "$sa" >/dev/null' EXIT
token="$(aws grafana create-workspace-service-account-token --workspace-id "$ws" \
  --service-account-id "$sa" --name setup --seconds-to-live 3600 \
  --query serviceAccountToken.key --output text)"

api() {
  curl -sf -H "Authorization: Bearer $token" -H "Content-Type: application/json" "$@"
}

# uid가 같은 datasource가 있으면 지우고 다시 만든다.
datasource() {
  local uid="$1" name="$2" ds_url="$3" service="$4"
  api -X DELETE "$url/api/datasources/uid/$uid" >/dev/null 2>&1 || true
  api -X POST "$url/api/datasources" -d @- >/dev/null <<JSON
{
  "uid": "$uid", "name": "$name", "type": "grafana-amazonprometheus-datasource",
  "url": "$ds_url", "access": "proxy",
  "jsonData": {
    "httpMethod": "POST", "sigV4Auth": true, "sigV4Region": "$region",
    "sigV4AuthType": "ec2_iam_role", "sigv4Service": "$service"
  }
}
JSON
  echo "datasource: $name"
}

# ec2_iam_role는 AMG 콘솔의 "Workspace IAM role"이다. terraform이 만든 amg role로 서명한다.
datasource amp "AMP" "$amp_url" aps
datasource cloudwatch "CloudWatch PromQL" "https://monitoring.$region.amazonaws.com" monitoring

python3 -c 'import json,sys; print(json.dumps({"dashboard": json.load(open(sys.argv[1])), "overwrite": True}))' \
  grafana/compare.json | api -X POST "$url/api/dashboards/db" -d @- >/dev/null
echo "dashboard: $url/d/amp-vs-cloudwatch"
