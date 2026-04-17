#!/bin/bash
###############################################################################
# S3에 저장된 로그를 확인하는 스크립트
#
# 사용법:
#   chmod +x scripts/verify_s3.sh
#   ./scripts/verify_s3.sh                  # Lambda + Firehose 모두 확인
#   ./scripts/verify_s3.sh --method lambda  # Lambda 방식만 확인
#   ./scripts/verify_s3.sh --method firehose # Firehose 방식만 확인
###############################################################################

set -euo pipefail

BUCKET_NAME=$(terraform output -raw s3_bucket_name 2>/dev/null || echo "")
METHOD="all"

while [[ $# -gt 0 ]]; do
  case $1 in
    --method) METHOD="$2"; shift 2 ;;
    --bucket) BUCKET_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ -z "${BUCKET_NAME}" ]; then
  echo "Error: S3 bucket name not found. Run 'terraform output' or use --bucket flag."
  exit 1
fi

echo "=== S3 Log Verification ==="
echo "Bucket: ${BUCKET_NAME}"
echo "==========================="
echo ""

if [ "${METHOD}" = "all" ] || [ "${METHOD}" = "lambda" ]; then
  echo "--- Lambda 방식 (lambda-logs/) ---"
  echo ""
  aws s3 ls "s3://${BUCKET_NAME}/lambda-logs/" --recursive --human-readable | tail -20
  echo ""
  LAMBDA_COUNT=$(aws s3 ls "s3://${BUCKET_NAME}/lambda-logs/" --recursive | wc -l)
  echo "Total files (Lambda): ${LAMBDA_COUNT}"
  echo ""
fi

if [ "${METHOD}" = "all" ] || [ "${METHOD}" = "firehose" ]; then
  echo "--- Firehose 방식 (firehose-logs/) ---"
  echo ""
  aws s3 ls "s3://${BUCKET_NAME}/firehose-logs/" --recursive --human-readable | tail -20
  echo ""
  FIREHOSE_COUNT=$(aws s3 ls "s3://${BUCKET_NAME}/firehose-logs/" --recursive | wc -l)
  echo "Total files (Firehose): ${FIREHOSE_COUNT}"
  echo ""
fi

# 최신 파일 내용 확인
echo "--- 최신 파일 내용 미리보기 ---"
echo ""

if [ "${METHOD}" = "all" ] || [ "${METHOD}" = "lambda" ]; then
  LATEST_LAMBDA=$(aws s3 ls "s3://${BUCKET_NAME}/lambda-logs/" --recursive | sort | tail -1 | awk '{print $4}')
  if [ -n "${LATEST_LAMBDA}" ]; then
    echo "Latest Lambda file: ${LATEST_LAMBDA}"
    aws s3 cp "s3://${BUCKET_NAME}/${LATEST_LAMBDA}" - 2>/dev/null | head -30
    echo ""
  fi
fi

if [ "${METHOD}" = "all" ] || [ "${METHOD}" = "firehose" ]; then
  LATEST_FIREHOSE=$(aws s3 ls "s3://${BUCKET_NAME}/firehose-logs/" --recursive | sort | tail -1 | awk '{print $4}')
  if [ -n "${LATEST_FIREHOSE}" ]; then
    echo "Latest Firehose file: ${LATEST_FIREHOSE}"
    aws s3 cp "s3://${BUCKET_NAME}/${LATEST_FIREHOSE}" - 2>/dev/null | head -30
    echo ""
  fi
fi
