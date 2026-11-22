#!/bin/bash
# Inspect text locally. Report pattern names without printing matched values.

MATERIAL=$(cat) || exit 2

# --- 1. patterns -------------------------------------------------------------

PATTERNS=(
  'AWS access key id|(AKIA|ASIA)[0-9A-Z]{16}'
  'AWS secret access key|aws_secret_access_key[[:space:]]*[=:][[:space:]]*[A-Za-z0-9/+]{40}'
  'Anthropic key|sk-ant-[A-Za-z0-9_-]{20,}'
  'GitHub token|gh[pousr]_[A-Za-z0-9]{36,}'
  'GitHub fine-grained token|github_pat_[A-Za-z0-9_]{22,}'
  'Slack token|xox[baprs]-[A-Za-z0-9-]{10,}'
  'Google API key|AIza[0-9A-Za-z_-]{35}'
  'private key block|-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
# Account ids in ARNs, except the placeholders AWS documentation uses.
ARN='arn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:[0-9]{12}:'
ARN_OK='arn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:(111122223333|123456789012|000000000000|999999999999):'

# Only the two sample credentials from the AWS documentation are exempt.
SCAN=$(echo "$MATERIAL" | LC_ALL=C sed -e 's/AKIAIOSFODNN7EXAMPLE//g' -e 's#wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY##g')
HITS=()
for entry in "${PATTERNS[@]}"; do
  name="${entry%%|*}"; pat="${entry#*|}"
  n=$(echo "$SCAN" | grep -acE -e "$pat")
  [ "$n" -gt 0 ] && HITS+=("- $name: $n line(s)")
done
n=$(echo "$SCAN" | grep -aE -e "$ARN" | grep -acvE -e "$ARN_OK")
[ "$n" -gt 0 ] && HITS+=("- real-looking AWS account id in an ARN: $n line(s)")

if [ ${#HITS[@]} -gt 0 ]; then
  printf 'Sensitive material detected (values hidden):\n' >&2
  printf '%s\n' "${HITS[@]}" >&2
  exit 2
fi
