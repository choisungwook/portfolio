#!/usr/bin/env bash
# LiteLLM prompt_tokens 합을 Cost Explorer의 input token usage type과 비교할 수 있게 쪼갠다.
# billable_input 만 Bedrock의 input token(InputTokenCount)에 대응한다. 나머지는 LiteLLM 쪽에만 있거나 다른 usage type이다.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T db psql -U litellm -d litellm -c "
WITH r AS (
  SELECT prompt_tokens AS p,
         cache_hit = 'True'   AS hit,
         status = 'failure'   AS failed,
         COALESCE((metadata::jsonb #>> '{usage_object,cache_read_input_tokens}')::int, 0)     AS cr,
         COALESCE((metadata::jsonb #>> '{usage_object,cache_creation_input_tokens}')::int, 0) AS cw
  FROM \"LiteLLM_SpendLogs\")
SELECT sum(p)                                                   AS litellm_prompt_tokens,
       sum(p - cr - cw) FILTER (WHERE NOT hit AND NOT failed)   AS billable_input,
       sum(cr)          FILTER (WHERE NOT hit AND NOT failed)   AS bedrock_cache_read,
       sum(cw)          FILTER (WHERE NOT hit AND NOT failed)   AS bedrock_cache_write,
       COALESCE(sum(p)  FILTER (WHERE hit), 0)                  AS litellm_cache_hit_replay,
       COALESCE(sum(p)  FILTER (WHERE failed), 0)               AS failed_estimate,
       round(100.0 * sum(p) / NULLIF(sum(p - cr - cw) FILTER (WHERE NOT hit AND NOT failed), 0) - 100, 1) AS pct_over_billable_input
FROM r;"
