#!/usr/bin/env bash

set -euo pipefail

RUN_ID=""
PROM_URL="http://127.0.0.1:9090"
STEP="1s"

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_ROOT="${BASE_DIR}/artifacts"

usage() {
  cat <<USAGE
Usage: bash scripts/export_prometheus_csv.sh --run-id <id> [options]

Options:
  --run-id <id>      Run ID created by load_test.sh (required)
  --prom-url <url>   Prometheus base URL (default: ${PROM_URL})
  --step <duration>  query_range step (default: ${STEP})
  -h, --help         Show help
USAGE
}

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-id)
      RUN_ID="$2"
      shift 2
      ;;
    --prom-url)
      PROM_URL="$2"
      shift 2
      ;;
    --step)
      STEP="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "ERROR: unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$RUN_ID" ]]; then
  log "ERROR: --run-id is required"
  usage
  exit 1
fi

RUN_DIR="${ARTIFACT_ROOT}/${RUN_ID}"
EVENTS_FILE="${RUN_DIR}/events.csv"
METRICS_FILE="${RUN_DIR}/metrics.csv"

if [[ ! -f "$EVENTS_FILE" ]]; then
  log "ERROR: events file not found: ${EVENTS_FILE}"
  exit 1
fi

START_TS="$(awk -F, 'NR==2{min=$1} NR>1 && $1<min{min=$1} END{print min}' "$EVENTS_FILE")"
END_TS="$(awk -F, 'NR==2{max=$1} NR>1 && $1>max{max=$1} END{print max}' "$EVENTS_FILE")"

if [[ -z "$START_TS" || -z "$END_TS" ]]; then
  log "ERROR: failed to parse timestamps from ${EVENTS_FILE}"
  exit 1
fi

END_TS="$((END_TS + 1))"

log "exporting metrics for run_id=${RUN_ID}"
log "time range: ${START_TS}..${END_TS}, step=${STEP}"

python3 - "$PROM_URL" "$START_TS" "$END_TS" "$STEP" "$METRICS_FILE" <<'PY'
import csv
import json
import sys
import urllib.parse
import urllib.request

prom_url, start_ts, end_ts, step, out_csv = sys.argv[1:]

queries = {
    "mem_used_pct": "100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
    "mem_available_pct": "100 * (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
    "shmem_pct": "100 * (node_memory_Shmem_bytes / node_memory_MemTotal_bytes)",
    "cached_pct": "100 * (node_memory_Cached_bytes / node_memory_MemTotal_bytes)",
    "tmpfs_used_bytes": "sum(node_filesystem_size_bytes{fstype=\"tmpfs\",mountpoint=~\"/tmp|/dev/shm\"} - node_filesystem_free_bytes{fstype=\"tmpfs\",mountpoint=~\"/tmp|/dev/shm\"})",
    "tmpfs_used_pct": "100 * sum(node_filesystem_size_bytes{fstype=\"tmpfs\",mountpoint=~\"/tmp|/dev/shm\"} - node_filesystem_free_bytes{fstype=\"tmpfs\",mountpoint=~\"/tmp|/dev/shm\"}) / sum(node_filesystem_size_bytes{fstype=\"tmpfs\",mountpoint=~\"/tmp|/dev/shm\"})",
}


def query_range(expr: str):
    params = urllib.parse.urlencode(
        {
            "query": expr,
            "start": start_ts,
            "end": end_ts,
            "step": step,
        }
    )
    url = f"{prom_url.rstrip('/')}/api/v1/query_range?{params}"
    with urllib.request.urlopen(url, timeout=15) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    if payload.get("status") != "success":
        raise RuntimeError(f"query failed: {expr} => {payload}")

    result = payload["data"].get("result", [])
    if not result:
        return {}

    merged = {}
    for series in result:
        for ts, value in series.get("values", []):
            merged[int(float(ts))] = float(value)
    return merged

series_map = {name: query_range(expr) for name, expr in queries.items()}
all_timestamps = sorted({ts for series in series_map.values() for ts in series})

with open(out_csv, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["ts", *queries.keys()])
    for ts in all_timestamps:
        row = [ts]
        for metric_name in queries:
            value = series_map[metric_name].get(ts)
            row.append("" if value is None else f"{value:.6f}")
        writer.writerow(row)
PY

log "metrics csv written: ${METRICS_FILE}"
