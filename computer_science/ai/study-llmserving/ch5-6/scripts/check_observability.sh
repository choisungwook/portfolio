#!/usr/bin/env bash

set -euo pipefail

prometheus_url="${PROMETHEUS_URL:-http://127.0.0.1:9090}"
dcgm_url="${DCGM_URL:-http://127.0.0.1:9400}"
grafana_url="${GRAFANA_URL:-http://127.0.0.1:3000}"
grafana_user="${GRAFANA_USER:-admin}"
grafana_password="${GRAFANA_PASSWORD:-admin}"
vram_tolerance_mib="${VRAM_TOLERANCE_MIB:-256}"
freshness_seconds="${METRIC_FRESHNESS_SECONDS:-10}"

require_command() {
  command -v "$1" >/dev/null || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

wait_for_url() {
  local url="$1"
  for _ in $(seq 1 30); do
    curl --fail --silent "$url" >/dev/null && return 0
    sleep 2
  done
  echo "Timed out waiting for $url" >&2
  exit 1
}

wait_for_prometheus_target() {
  local health
  for _ in $(seq 1 30); do
    health="$(curl --fail --silent "$prometheus_url/api/v1/targets" | jq -r \
      '.data.activeTargets[] | select(.labels.job == "dcgm-exporter") | .health' || true)"
    [[ "$health" == "up" ]] && return 0
    sleep 2
  done
  echo "Prometheus dcgm-exporter target is not UP: ${health:-missing}" >&2
  exit 1
}

absolute_difference() {
  awk -v left="$1" -v right="$2" 'BEGIN { diff = left - right; print diff < 0 ? -diff : diff }'
}

assert_within_tolerance() {
  local label="$1"
  local left="$2"
  local right="$3"
  local difference
  difference="$(absolute_difference "$left" "$right")"
  awk -v diff="$difference" -v tolerance="$vram_tolerance_mib" 'BEGIN { exit !(diff <= tolerance) }' || {
    echo "$label differs by ${difference}MiB; tolerance is ${vram_tolerance_mib}MiB" >&2
    exit 1
  }
}

assert_percent() {
  local label="$1"
  local value="$2"
  awk -v number="$value" 'BEGIN { exit !(number >= 0 && number <= 100) }' || {
    echo "$label is outside 0-100: $value" >&2
    exit 1
  }
}

assert_number() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^-?[0-9]+([.][0-9]+)?$ ]]; then
    echo "$label is not numeric: $value" >&2
    exit 1
  fi
}

prometheus_value() {
  local metric="$1"
  curl --fail --silent --get "$prometheus_url/api/v1/query" \
    --data-urlencode "query=$metric" | jq -r '.data.result[0].value[1] // empty'
}

prometheus_metric_age() {
  local metric="$1"
  curl --fail --silent --get "$prometheus_url/api/v1/query" \
    --data-urlencode "query=min(time() - timestamp($metric))" | jq -r '.data.result[0].value[1] // empty'
}

wait_for_grafana_datasource() {
  local datasource
  local datasource_uid
  local datasource_health
  for _ in $(seq 1 30); do
    datasource="$(curl --silent --user "$grafana_user:$grafana_password" \
      "$grafana_url/api/datasources/name/Prometheus" || true)"
    datasource_uid="$(jq -r '.uid // empty' <<<"$datasource")"
    if [[ -n "$datasource_uid" ]]; then
      datasource_health="$(curl --silent --user "$grafana_user:$grafana_password" \
        "$grafana_url/api/datasources/uid/$datasource_uid/health" | jq -r '.status // empty')"
      [[ "$datasource_health" == "OK" ]] && return 0
    fi
    sleep 2
  done
  echo "Grafana Prometheus datasource is not healthy" >&2
  exit 1
}

require_command curl
require_command jq
require_command nvidia-smi
require_command awk

wait_for_url "$dcgm_url/metrics"
wait_for_url "$prometheus_url/-/ready"
wait_for_url "$grafana_url/api/health"
wait_for_prometheus_target

dcgm_metrics="$(curl --fail --silent "$dcgm_url/metrics")"
dcgm_vram="$(awk '/^DCGM_FI_DEV_FB_USED\{/ { print $NF; exit }' <<<"$dcgm_metrics")"
dcgm_util="$(awk '/^DCGM_FI_DEV_GPU_UTIL\{/ { print $NF; exit }' <<<"$dcgm_metrics")"
host_vram="$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1 | tr -d ' ')"
host_util="$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits | head -1 | tr -d ' ')"
prometheus_vram="$(prometheus_value "last_over_time(DCGM_FI_DEV_FB_USED[${freshness_seconds}s])")"
prometheus_util="$(prometheus_value "last_over_time(DCGM_FI_DEV_GPU_UTIL[${freshness_seconds}s])")"
metric_age="$(prometheus_metric_age DCGM_FI_DEV_FB_USED)"

for value in "$dcgm_vram" "$dcgm_util" "$host_vram" "$host_util" "$prometheus_vram" "$prometheus_util" "$metric_age"; do
  if [[ -z "$value" ]]; then
    echo "GPU observability metric is missing" >&2
    exit 1
  fi
done

assert_number "DCGM VRAM" "$dcgm_vram"
assert_number "DCGM GPU utilization" "$dcgm_util"
assert_number "nvidia-smi VRAM" "$host_vram"
assert_number "nvidia-smi GPU utilization" "$host_util"
assert_number "Prometheus VRAM" "$prometheus_vram"
assert_number "Prometheus GPU utilization" "$prometheus_util"
assert_number "Prometheus metric age" "$metric_age"
assert_within_tolerance "nvidia-smi and DCGM VRAM" "$host_vram" "$dcgm_vram"
assert_within_tolerance "DCGM and Prometheus VRAM" "$dcgm_vram" "$prometheus_vram"
assert_percent "nvidia-smi GPU utilization" "$host_util"
assert_percent "DCGM GPU utilization" "$dcgm_util"
assert_percent "Prometheus GPU utilization" "$prometheus_util"

awk -v age="$metric_age" -v limit="$freshness_seconds" 'BEGIN { exit !(age >= -2 && age <= limit) }' || {
  echo "Prometheus GPU metric is stale: ${metric_age}s" >&2
  exit 1
}

wait_for_grafana_datasource

echo "Prometheus dcgm-exporter target: UP"
echo "VRAM MiB: nvidia-smi=$host_vram dcgm=$dcgm_vram prometheus=$prometheus_vram"
echo "GPU utilization %: nvidia-smi=$host_util dcgm=$dcgm_util prometheus=$prometheus_util"
echo "Prometheus GPU metric age: ${metric_age}s"
echo "Grafana Prometheus datasource: OK"
