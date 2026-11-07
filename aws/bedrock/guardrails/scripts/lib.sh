# source scripts/lib.sh 로 불러 쓰는 호출 헬퍼
: "${LITELLM_URL:=http://localhost:4000}"
[ -f .env ] && set -a && source .env && set +a

# chat <model> <guardrail|none> <message> [stream=false]
chat() {
  local guardrails='[]'
  [ "$2" != none ] && guardrails="[\"$2\"]"
  curl -sN "$LITELLM_URL/v1/chat/completions" \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
    -d "$(jq -n --arg m "$1" --arg c "$3" --argjson s "${4:-false}" --argjson g "$guardrails" \
      '{model:$m, stream:$s, max_tokens:300, messages:[{role:"user",content:$c}], guardrails:$g}')" \
    -w '\nHTTP %{http_code} total %{time_total}s ttfb %{time_starttransfer}s\n'
}

# chat_json <guardrail> <messages-json> : 멀티턴, system 메시지 실험용
chat_json() {
  curl -s "$LITELLM_URL/v1/chat/completions" \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
    -d "$(jq -n --arg g "$1" --argjson msgs "$2" '{model:"nova-micro", max_tokens:200, messages:$msgs, guardrails:[$g]}')" \
    -w '\nHTTP %{http_code} total %{time_total}s\n'
}

# apply_only <guardrail> <text> : 모델 호출 없이 guardrail만 실행
apply_only() {
  curl -s "$LITELLM_URL/guardrails/apply_guardrail" \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
    -d "$(jq -n --arg g "$1" --arg t "$2" '{guardrail_name:$g, text:$t}')"
  echo
}

# aws_apply <text> [INPUT|OUTPUT] : LiteLLM 없이 ApplyGuardrail 직접 호출, 판정과 정책만 출력
aws_apply() {
  aws bedrock-runtime apply-guardrail --region "$AWS_REGION" \
    --guardrail-identifier "$GUARDRAIL_ID" --guardrail-version "${GUARDRAIL_VERSION:-1}" \
    --source "${2:-INPUT}" --content "$(jq -n --arg t "$1" '[{text:{text:$t}}]')" \
    --query '{action:action, out:outputs[0].text, units:usage, a:assessments[0]}' --output json |
    jq -c '{action, out, units: (.units|with_entries(select(.value>0))),
      hits: ([(.a.contentPolicy.filters // [])[] | select(.detected) | "\(.type):\(.confidence)"]
        + [(.a.topicPolicy.topics // [])[] | "TOPIC:\(.name)"]
        + [(.a.wordPolicy.customWords // [])[], (.a.wordPolicy.managedWordLists // [])[] | "WORD:\(.match)"]
        + [(.a.sensitiveInformationPolicy.piiEntities // [])[] | "PII:\(.type):\(.action)"]
        + [(.a.sensitiveInformationPolicy.regexes // [])[] | "REGEX:\(.name):\(.action)"])}'
}
