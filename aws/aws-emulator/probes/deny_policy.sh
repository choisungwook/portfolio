#!/usr/bin/env bash
# 버킷 정책으로 GetObject를 모든 주체에 Deny한 뒤 GetObject를 시도한다.
# 실제 AWS는 명시적 Deny가 관리자 권한보다 우선하므로 AccessDenied여야 한다.
set -u
BUCKET="deny-policy-test-$(date +%s)"
REGION="${AWS_REGION:-us-west-2}"
aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
echo hello | aws s3 cp - "s3://$BUCKET/hello.txt" >/dev/null
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{\"Effect\": \"Deny\", \"Principal\": \"*\", \"Action\": \"s3:GetObject\", \"Resource\": \"arn:aws:s3:::$BUCKET/*\"}]
}"
echo "get-object after Deny policy:"
aws s3 cp "s3://$BUCKET/hello.txt" - 2>&1 | sed 's/^/  /'
# 정리. 실제 AWS에서도 Deny 정책은 DeleteObject를 막지 않는다
aws s3api delete-bucket-policy --bucket "$BUCKET"
aws s3 rm "s3://$BUCKET/hello.txt" >/dev/null
aws s3api delete-bucket --bucket "$BUCKET"
echo "cleanup done: $BUCKET"
