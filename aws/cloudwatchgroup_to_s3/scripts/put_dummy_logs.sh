#!/bin/bash
###############################################################################
# CloudWatch Log Group에 더미 로그를 지속적으로 전송하는 스크립트
# Firehose 실시간 전송 테스트를 위해 반복적으로 로그를 생성
#
# 사용법:
#   chmod +x scripts/put_dummy_logs.sh
#   ./scripts/put_dummy_logs.sh                    # 기본값: 5초 간격, 무한 반복
#   ./scripts/put_dummy_logs.sh --interval 3       # 3초 간격
#   ./scripts/put_dummy_logs.sh --count 10         # 10번만 반복
#   ./scripts/put_dummy_logs.sh --interval 2 --count 20
###############################################################################

set -euo pipefail

LOG_GROUP_NAME=$(terraform output -raw cloudwatch_log_group_name 2>/dev/null || echo "/cw-to-s3/app")
LOG_STREAM_NAME="dummy-stream-$(date +%Y%m%d%H%M%S)"
INTERVAL=5
COUNT=0  # 0 = 무한 반복

# 인자 파싱
while [[ $# -gt 0 ]]; do
  case $1 in
    --interval) INTERVAL="$2"; shift 2 ;;
    --count)    COUNT="$2"; shift 2 ;;
    --log-group) LOG_GROUP_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "=== CloudWatch Dummy Log Generator ==="
echo "Log Group:  ${LOG_GROUP_NAME}"
echo "Log Stream: ${LOG_STREAM_NAME}"
echo "Interval:   ${INTERVAL}s"
echo "Count:      $([ "$COUNT" -eq 0 ] && echo 'infinite' || echo "$COUNT")"
echo "======================================="

# Log stream 생성
aws logs create-log-stream \
  --log-group-name "${LOG_GROUP_NAME}" \
  --log-stream-name "${LOG_STREAM_NAME}"

echo "Log stream created: ${LOG_STREAM_NAME}"

SEQUENCE_TOKEN=""
ITERATION=0

# 더미 로그 메시지 목록
MESSAGES=(
  "INFO: Application started successfully"
  "INFO: Health check passed"
  "WARN: High memory usage detected - 85%"
  "INFO: Processing request from user_id=12345"
  "ERROR: Database connection timeout after 30s"
  "INFO: Cache hit ratio: 92.3%"
  "WARN: Slow query detected - 2.5s execution time"
  "INFO: Deployed version v1.2.3 successfully"
  "ERROR: Failed to send notification - retry scheduled"
  "INFO: Batch job completed - processed 1500 records"
)

put_log_event() {
  local timestamp
  timestamp=$(date +%s%3N)
  local msg_index=$((RANDOM % ${#MESSAGES[@]}))
  local message="${MESSAGES[$msg_index]}"
  local full_message="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ${message} (iteration=${ITERATION})"

  if [ -z "${SEQUENCE_TOKEN}" ]; then
    aws logs put-log-events \
      --log-group-name "${LOG_GROUP_NAME}" \
      --log-stream-name "${LOG_STREAM_NAME}" \
      --log-events "timestamp=${timestamp},message=${full_message}" \
      --output json > /tmp/put_log_result.json 2>&1
  else
    aws logs put-log-events \
      --log-group-name "${LOG_GROUP_NAME}" \
      --log-stream-name "${LOG_STREAM_NAME}" \
      --log-events "timestamp=${timestamp},message=${full_message}" \
      --sequence-token "${SEQUENCE_TOKEN}" \
      --output json > /tmp/put_log_result.json 2>&1
  fi

  SEQUENCE_TOKEN=$(jq -r '.nextSequenceToken // empty' /tmp/put_log_result.json 2>/dev/null || true)
  echo "[$(date +%H:%M:%S)] Sent: ${full_message}"
}

# Ctrl+C 처리
trap 'echo -e "\n\nStopped. Total logs sent: ${ITERATION}"; exit 0' INT

echo ""
echo "Sending dummy logs... (Ctrl+C to stop)"
echo ""

while true; do
  ITERATION=$((ITERATION + 1))
  put_log_event

  if [ "$COUNT" -gt 0 ] && [ "$ITERATION" -ge "$COUNT" ]; then
    echo ""
    echo "Completed. Total logs sent: ${ITERATION}"
    break
  fi

  sleep "${INTERVAL}"
done
