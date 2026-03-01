#!/usr/bin/env bash

set -euo pipefail

# Defaults
STEP_MB=256
STEPS=4
HOLD_SEC=60
TARGET_DIR="/tmp"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
NO_CLEANUP=0
DOCKER_CONTAINER=""

# Paths
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_ROOT="${PROJECT_ROOT}/artifacts"

# Runtime context
WORK_DIR=""
EVENTS_FILE=""
RUN_DIR=""
TOTAL_MB=0

usage() {
  cat <<USAGE
Usage: bash scripts/load_test.sh [options]

Options:
  --step-mb <int>      Write size per step in MB (default: ${STEP_MB})
  --steps <int>        Number of write/delete steps (default: ${STEPS})
  --hold-sec <int>     Hold time per phase in seconds (default: ${HOLD_SEC})
  --target-dir <path>  Target mount path, /tmp recommended (default: ${TARGET_DIR})
  --docker-container <name>  Run workload inside target container
  --run-id <string>    Run identifier (default: current timestamp)
  --no-cleanup         Keep generated files after script exits
  -h, --help           Show this help
USAGE
}

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

sanitize_csv() {
  local input="$1"
  input="${input//$'\n'/ }"
  input="${input//,/;}"
  printf '%s' "$input"
}

event() {
  local name="$1"
  local detail="${2:-}"
  local ts
  ts="$(date +%s)"
  printf '%s,%s,%s\n' "$ts" "$name" "$(sanitize_csv "$detail")" >> "$EVENTS_FILE"
}

# Execute command on host or inside container target
# Input is a shell command string.
target_exec() {
  local cmd="$1"
  if [[ -n "$DOCKER_CONTAINER" ]]; then
    docker exec "$DOCKER_CONTAINER" bash -lc "$cmd"
  else
    bash -lc "$cmd"
  fi
}

target_dir_exists() {
  local dir_path="$1"
  if [[ -n "$DOCKER_CONTAINER" ]]; then
    docker exec "$DOCKER_CONTAINER" bash -lc "[[ -d '$dir_path' ]]" >/dev/null 2>&1
  else
    [[ -d "$dir_path" ]]
  fi
}

mem_snapshot_kv() {
  local mem_total mem_available shmem cached
  mem_total="$(target_exec "awk '/^MemTotal:/ {print \$2}' /proc/meminfo")"
  mem_available="$(target_exec "awk '/^MemAvailable:/ {print \$2}' /proc/meminfo")"
  shmem="$(target_exec "awk '/^Shmem:/ {print \$2}' /proc/meminfo")"
  cached="$(target_exec "awk '/^Cached:/ {print \$2}' /proc/meminfo")"
  printf 'mem_total_kb=%s;mem_available_kb=%s;shmem_kb=%s;cached_kb=%s' \
    "$mem_total" "$mem_available" "$shmem" "$cached"
}

free_snapshot_kv() {
  target_exec "free -m | awk 'NR==2 {printf \"mem_total_mb=%s;mem_used_mb=%s;mem_free_mb=%s;mem_shared_mb=%s;mem_buff_cache_mb=%s;mem_available_mb=%s\", \$2,\$3,\$4,\$5,\$6,\$7}'"
}

log_mem_status() {
  local free_kv mem_kv workdir_h
  free_kv="$(free_snapshot_kv)"
  mem_kv="$(mem_snapshot_kv)"
  workdir_h="$(target_exec "du -sh '$WORK_DIR' | awk '{print \$1}'")"
  log "mem_status: target=${TARGET_DIR};workdir=${workdir_h};${free_kv};${mem_kv}"
}

cleanup() {
  if [[ -n "$WORK_DIR" && "$NO_CLEANUP" -eq 0 ]] && target_dir_exists "$WORK_DIR"; then
    target_exec "rm -rf '$WORK_DIR'"
    log "cleanup completed: ${WORK_DIR}"
  fi
}

cleanup_stale_workdirs() {
  local stale_count
  stale_count="$(target_exec "find '$TARGET_DIR' -maxdepth 1 -mindepth 1 -type d -name 'tmpfs-memory-*' | wc -l | tr -d '[:space:]'")"

  if [[ "$stale_count" -gt 0 ]]; then
    target_exec "find '$TARGET_DIR' -maxdepth 1 -mindepth 1 -type d -name 'tmpfs-memory-*' -exec rm -rf {} +"
    log "removed stale tmpfs workdirs: ${stale_count} (target=${TARGET_DIR})"
  else
    log "no stale tmpfs workdirs found (target=${TARGET_DIR})"
  fi
}

# Argument parsing
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --step-mb)
        STEP_MB="$2"
        shift 2
        ;;
      --steps)
        STEPS="$2"
        shift 2
        ;;
      --hold-sec)
        HOLD_SEC="$2"
        shift 2
        ;;
      --target-dir)
        TARGET_DIR="$2"
        shift 2
        ;;
      --docker-container)
        DOCKER_CONTAINER="$2"
        shift 2
        ;;
      --run-id)
        RUN_ID="$2"
        shift 2
        ;;
      --no-cleanup)
        NO_CLEANUP=1
        shift
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
}

# Validation
validate_numeric_inputs() {
  if ! [[ "$STEP_MB" =~ ^[0-9]+$ ]] || ! [[ "$STEPS" =~ ^[0-9]+$ ]] || ! [[ "$HOLD_SEC" =~ ^[0-9]+$ ]]; then
    log "ERROR: --step-mb, --steps, --hold-sec must be integers"
    exit 1
  fi

  if [[ "$STEP_MB" -le 0 || "$STEPS" -le 0 || "$HOLD_SEC" -le 0 ]]; then
    log "ERROR: --step-mb, --steps, --hold-sec must be > 0"
    exit 1
  fi
}

validate_docker_context() {
  if [[ -z "$DOCKER_CONTAINER" ]]; then
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    log "ERROR: docker command not found, required for --docker-container"
    exit 1
  fi

  if [[ "$(docker inspect -f '{{.State.Running}}' "$DOCKER_CONTAINER" 2>/dev/null || true)" != "true" ]]; then
    log "ERROR: docker container is not running: ${DOCKER_CONTAINER}"
    exit 1
  fi
}

choose_target_dir() {
  local fs_type
  fs_type="$(target_exec "df -T '$TARGET_DIR' | awk 'NR==2 {print \$2}'")"

  if [[ "$fs_type" == "tmpfs" ]]; then
    log "target directory is tmpfs: ${TARGET_DIR}"
    return
  fi

  if [[ "$TARGET_DIR" == "/tmp" ]]; then
    local shm_type
    shm_type="$(target_exec "df -T /dev/shm | awk 'NR==2 {print \$2}'")"
    if [[ "$shm_type" == "tmpfs" ]]; then
      TARGET_DIR="/dev/shm"
      log "/tmp is not tmpfs, switched target to /dev/shm"
      return
    fi
  fi

  log "ERROR: target directory is not tmpfs (${TARGET_DIR}, type=${fs_type})"
  exit 1
}

# Environment setup
prepare_artifacts() {
  mkdir -p "$ARTIFACT_ROOT"
  RUN_DIR="${ARTIFACT_ROOT}/${RUN_ID}"
  mkdir -p "$RUN_DIR"

  EVENTS_FILE="${RUN_DIR}/events.csv"
  printf 'ts,event,detail\n' > "$EVENTS_FILE"
}

prepare_workdir() {
  choose_target_dir
  cleanup_stale_workdirs

  WORK_DIR="${TARGET_DIR}/tmpfs-memory-${RUN_ID}"
  target_exec "mkdir -p '$WORK_DIR'"

  TOTAL_MB=$((STEP_MB * STEPS))
}

log_run_config() {
  log "run_id=${RUN_ID}"
  log "artifacts_dir=${RUN_DIR}"
  log "target_dir=${TARGET_DIR}"
  if [[ -n "$DOCKER_CONTAINER" ]]; then
    log "docker_container=${DOCKER_CONTAINER}"
  fi
  log "step_mb=${STEP_MB}, steps=${STEPS}, hold_sec=${HOLD_SEC}, total_write_mb=${TOTAL_MB}"
}

# Workload phases
sleep_phase() {
  local phase="$1"
  event "phase_start" "name=${phase};$(mem_snapshot_kv)"
  sleep "$HOLD_SEC"
  event "phase_end" "name=${phase};$(mem_snapshot_kv)"
}

get_workdir_bytes() {
  target_exec "du -sb '$WORK_DIR' | awk '{print \$1}'"
}

write_step() {
  local i="$1"
  local file_path workdir_bytes

  file_path="${WORK_DIR}/chunk_$(printf '%02d' "$i").bin"
  target_exec "dd if=/dev/zero of='$file_path' bs=1M count='$STEP_MB' conv=fsync status=none"

  workdir_bytes="$(get_workdir_bytes)"
  event "write_step_${i}" "chunk_mb=${STEP_MB};total_mb=$((i * STEP_MB));workdir_bytes=${workdir_bytes};$(free_snapshot_kv);$(mem_snapshot_kv)"
  log "write step ${i}/${STEPS}: +${STEP_MB}MB (total=$((i * STEP_MB))MB)"
  log_mem_status

  sleep_phase "after_write_${i}"
}

delete_step() {
  local i="$1"
  local file_path workdir_bytes

  file_path="${WORK_DIR}/chunk_$(printf '%02d' "$i").bin"
  target_exec "rm -f '$file_path'"

  workdir_bytes="$(get_workdir_bytes)"
  event "delete_step_${i}" "remaining_mb=$(((i - 1) * STEP_MB));workdir_bytes=${workdir_bytes};$(free_snapshot_kv);$(mem_snapshot_kv)"
  log "delete step ${i}/${STEPS}: -${STEP_MB}MB (remaining=$(((i - 1) * STEP_MB))MB)"
  log_mem_status

  sleep_phase "after_delete_${i}"
}

run_workload() {
  local i

  event "run_start" "target_dir=${TARGET_DIR};step_mb=${STEP_MB};steps=${STEPS};hold_sec=${HOLD_SEC};$(free_snapshot_kv);$(mem_snapshot_kv)"
  log_mem_status

  sleep_phase "baseline"

  for ((i=1; i<=STEPS; i++)); do
    write_step "$i"
  done

  for ((i=STEPS; i>=1; i--)); do
    delete_step "$i"
  done

  sleep_phase "recovery"
  event "run_end" "$(mem_snapshot_kv)"
}

# Finalization
finalize_run() {
  if [[ "$NO_CLEANUP" -eq 1 ]]; then
    log "no-cleanup enabled, keeping files under ${WORK_DIR}"
  else
    target_exec "rm -rf '$WORK_DIR'"
    log "workdir removed: ${WORK_DIR}"
  fi

  log "hands-on completed"
  log "events csv: ${EVENTS_FILE}"
  log "next: bash scripts/export_prometheus_csv.sh --run-id ${RUN_ID}"
}

main() {
  parse_args "$@"

  validate_numeric_inputs
  validate_docker_context

  prepare_artifacts
  trap cleanup EXIT INT TERM

  prepare_workdir
  log_run_config

  run_workload
  finalize_run
}

main "$@"
