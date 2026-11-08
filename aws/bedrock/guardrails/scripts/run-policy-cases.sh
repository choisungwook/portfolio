#!/usr/bin/env bash
# policy-cases.tsv의 문장을 ApplyGuardrail(INPUT)에 직접 넣고 판정을 표로 출력한다. 모델은 호출하지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .runtime.env; set +a
source scripts/lib.sh

echo "| 케이스 | 기대 | 판정 | 걸린 정책 | 출력 |"
echo "|---|---|---|---|---|"
while IFS=$'\t' read -r case expect text; do
  r=$(aws_apply "$text")
  echo "| $case | $expect | $(jq -r .action <<<"$r") | $(jq -r '.hits|join(", ")' <<<"$r") | $(jq -r '.out // "-"' <<<"$r") |"
done < scripts/policy-cases.tsv
