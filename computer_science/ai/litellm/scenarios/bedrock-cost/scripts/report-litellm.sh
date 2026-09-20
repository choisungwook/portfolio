#!/usr/bin/env bash
# LiteLLM이 기록한 시나리오별 요청 수, token, spend를 Postgres에서 읽는다.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T db psql -U litellm -d litellm -c "
SELECT request_tags->>0 AS scenario,
       count(*)                                        AS requests,
       count(*) FILTER (WHERE status = 'failure')      AS failures,
       count(*) FILTER (WHERE cache_hit = 'True')      AS litellm_cache_hits,
       sum(prompt_tokens)                              AS prompt_tokens,
       sum(completion_tokens)                          AS completion_tokens,
       round(sum(spend)::numeric, 6)                   AS spend_usd
FROM \"LiteLLM_SpendLogs\"
GROUP BY 1 ORDER BY 1;"
