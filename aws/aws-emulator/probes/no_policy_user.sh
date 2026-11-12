#!/usr/bin/env bash
# 정책이 하나도 없는 IAM 사용자의 access key로 s3 list-buckets를 호출한다.
# 실제 AWS는 권한이 없으므로 AccessDenied여야 한다. 키는 화면에 출력하지 않고 끝나면 지운다.
set -u
USER_NAME="no-policy-user-$(date +%s)"
aws iam create-user --user-name "$USER_NAME" >/dev/null
read -r KEY_ID SECRET <<<"$(aws iam create-access-key --user-name "$USER_NAME" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)"
sleep "${IAM_PROPAGATION_SECONDS:-0}"
echo "list-buckets as $USER_NAME (no policy):"
env -u AWS_PROFILE -u AWS_SHARED_CREDENTIALS_FILE AWS_ACCESS_KEY_ID="$KEY_ID" AWS_SECRET_ACCESS_KEY="$SECRET" \
  aws s3api list-buckets --query 'length(Buckets)' 2>&1 | sed 's/^/  /'
aws iam delete-access-key --user-name "$USER_NAME" --access-key-id "$KEY_ID"
aws iam delete-user --user-name "$USER_NAME"
echo "cleanup done: $USER_NAME"
