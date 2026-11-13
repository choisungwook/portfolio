#!/usr/bin/env bash
# 한 사용자(actor)의 장기 메모리 record와 단기 메모리 event를 모두 지운다.
# 사용: scripts/forget_actor.sh <actorId>
set -euo pipefail
cd "$(dirname "$0")/.."
source .runtime.env
ACTOR="$1"
export AWS_PAGER=""
cli() { aws bedrock-agentcore --region "$AWS_REGION" "$@"; }

# 장기 메모리: namespace 경로 하나로 이 사용자의 record를 찾아 100개씩 지운다.
# 목록은 색인을 거쳐 늦게 반영되므로 빈 목록이 두 번 연속 나올 때까지 반복한다
empty=0
while [ "$empty" -lt 2 ]; do
  records=$(cli list-memory-records --memory-id "$MEMORY_ID" --namespace-path "/actor/$ACTOR/" --max-items 100 \
    --query 'memoryRecordSummaries[].{memoryRecordId: memoryRecordId}' --output json)
  if [ "$records" = "[]" ]; then
    empty=$((empty + 1))
  else
    empty=0
    cli batch-delete-memory-records --memory-id "$MEMORY_ID" --records "$records" \
      --query '{deleted: length(successfulRecords), failed: length(failedRecords)}' --output text
  fi
  sleep 10
done

# 단기 메모리: 채팅창(session)마다 event를 하나씩 지운다
for session in $(cli list-sessions --memory-id "$MEMORY_ID" --actor-id "$ACTOR" --query 'sessionSummaries[].sessionId' --output text); do
  for event in $(cli list-events --memory-id "$MEMORY_ID" --actor-id "$ACTOR" --session-id "$session" --no-include-payloads --query 'events[].eventId' --output text); do
    cli delete-event --memory-id "$MEMORY_ID" --actor-id "$ACTOR" --session-id "$session" --event-id "$event" > /dev/null
  done
  echo "deleted events in $session"
done
