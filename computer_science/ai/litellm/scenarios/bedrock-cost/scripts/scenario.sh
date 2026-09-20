#!/usr/bin/env bash
# 사용법: scripts/scenario.sh <1|2|3|4>
# 시나리오별 요청을 LiteLLM proxy로 보낸다.
# tags로 spend log(Postgres)에서 시나리오를 가른다.
# Prometheus 지표에는 시나리오 라벨을 붙일 수 없다. 이유는 docs/6-observe.md에 있다.
# Grafana에서는 시나리오를 시간으로 가르므로 run-all.sh로 간격을 두고 돌린다.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
URL=http://localhost:4020/v1/chat/completions
KEY=${LITELLM_KEY:-$LITELLM_MASTER_KEY}

call() { # $1=json body, 나머지는 curl 옵션
  local body=$1; shift
  curl -sS "$@" "$URL" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d "$body"
}
usage() { jq -c '{usage: .usage, error: .error}'; }

case "${1:-}" in
  1) # 기준선: 서로 다른 짧은 질문 5개. 캐시가 끼지 않는다.
    for i in 1 2 3 4 5; do
      call "$(jq -n --arg q "숫자 $i 의 제곱을 한 단어로 답해" \
        '{model:"claude-sonnet", max_tokens:50, metadata:{tags:["s1"]}, messages:[{role:"user",content:$q}]}')" | usage
    done ;;
  2) # LiteLLM 응답 캐시: 같은 요청 10번. Bedrock 호출은 1번이어야 한다.
    for i in $(seq 10); do
      call "$(jq -n '{model:"claude-sonnet", max_tokens:200, metadata:{tags:["s2"]},
        messages:[{role:"user",content:"TCP 3-way handshake를 세 문장으로 설명해"}]}')" | usage
    done ;;
  3) # Bedrock prompt caching: 큰 system prompt에 cache_control을 붙여 5번. 1번 write, 4번 read.
    SYS=$(printf '%.0s이 문장은 prompt caching 최소 길이를 넘기기 위한 채움 문장입니다. ' $(seq 300))
    for i in 1 2 3 4 5; do
      call "$(jq -n --arg sys "$SYS" --arg q "숫자 $i 을 영어로 한 단어로 답해" \
        '{model:"claude-sonnet", max_tokens:50, metadata:{tags:["s3"]}, cache:{"no-cache":true},
          messages:[{role:"system",content:[{type:"text",text:$sys,cache_control:{type:"ephemeral"}}]},
                    {role:"user",content:$q}]}')" | usage
    done ;;
  4) # 스트리밍 중단: 2초 뒤 클라이언트가 끊는다. 3번 반복.
    for i in 1 2 3; do
      call "$(jq -n --arg q "Kubernetes 스케줄러 동작을 아주 길게 설명해 ($i)" \
        '{model:"claude-sonnet", max_tokens:800, stream:true, metadata:{tags:["s4"]}, cache:{"no-cache":true},
          messages:[{role:"user",content:$q}]}')" -N --max-time 2 >/dev/null || echo "요청 $i: 2초에 끊음"
    done ;;
  *) echo "usage: $0 <1|2|3|4>"; exit 1 ;;
esac
