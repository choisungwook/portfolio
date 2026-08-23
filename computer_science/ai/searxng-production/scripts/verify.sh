#!/bin/sh

set -eu

base_url="http://localhost:8088"
credentials="lab:production-lab"
browser_user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36"

request_code() {
  curl -sS --compressed -o /dev/null -w "%{http_code}" "$@"
}

reset_limiter() {
  docker compose exec -T valkey valkey-cli FLUSHDB >/dev/null
}

unauthorized_code=$(request_code "$base_url/")
authorized_code=$(request_code -u "$credentials" -A "$browser_user_agent" -H "Accept: text/html" "$base_url/")

test "$unauthorized_code" = "401"
test "$authorized_code" = "200"
printf 'authentication: unauthenticated=%s authenticated=%s\n' "$unauthorized_code" "$authorized_code"

printf 'upstreams:'
i=1
while [ "$i" -le 4 ]; do
  upstream=$(curl -sSI -u "$credentials" -A "$browser_user_agent" -H "Accept: text/html" "$base_url/" | awk -F': ' 'tolower($1) == "x-searxng-upstream" {gsub("\\r", "", $2); print $2}')
  printf ' %s' "$upstream"
  i=$((i + 1))
done
printf '\n'

reset_limiter
printf 'api limiter:'
i=1
while [ "$i" -le 6 ]; do
  code=$(request_code -u "$credentials" -A "$browser_user_agent" -H "Accept: text/html" -H "Accept-Language: en-US,en;q=0.9" "$base_url/search?q=rate-limit&format=json&engines=mock%20success")
  printf ' %s' "$code"
  i=$((i + 1))
done
printf '\n'

reset_limiter
mock_response=$(curl -sS --compressed -u "$credentials" -A "$browser_user_agent" -H "Accept: text/html" -H "Accept-Language: en-US,en;q=0.9" "$base_url/search?q=origin-block&format=json&engines=mock%20upstream")
printf '%s' "$mock_response" | grep -qi 'too many requests'
printf 'origin bot detection: SearXNG reported Too many requests\n'
