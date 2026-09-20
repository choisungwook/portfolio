#!/usr/bin/env bash
# 시나리오 1~4를 간격을 두고 돌린다. Prometheus 지표에는 시나리오 라벨이 없어서
# Grafana에서는 시간으로 시나리오를 가른다. 간격이 없으면 네 개가 한 덩어리로 보인다.
set -euo pipefail
cd "$(dirname "$0")/.."
GAP=${GAP:-120}

# 캐시가 남아 있으면 시나리오 1·2가 전부 Redis hit이 되어 Bedrock 호출이 0건이 된다.
# proxy를 다시 띄워 Prometheus counter도 0에서 시작하게 한다.
if [ "${CLEAN:-1}" = 1 ]; then
  docker compose exec -T redis redis-cli FLUSHALL >/dev/null
  docker compose restart litellm >/dev/null
  until curl -sf localhost:4020/health/liveliness >/dev/null 2>&1; do sleep 3; done
  echo "캐시를 비우고 counter를 0으로 되돌렸다"
fi
for n in 1 2 3 4; do
  printf '%s  시나리오 %s 시작\n' "$(date -u +%H:%M:%SZ)" "$n"
  scripts/scenario.sh "$n" >/dev/null
  printf '%s  시나리오 %s 끝\n' "$(date -u +%H:%M:%SZ)" "$n"
  [ "$n" = 4 ] || sleep "$GAP"
done
echo "Grafana에서 위 시각으로 각 시나리오 구간을 찾는다: http://localhost:3000"
