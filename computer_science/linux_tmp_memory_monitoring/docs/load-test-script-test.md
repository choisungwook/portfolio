# Script Test (`scripts/load_test.sh`)

## 1. Stack Start

```bash
make up
```

## 2. Script Run

```bash
bash scripts/load_test.sh --docker-container tmpfs-lab --target-dir /tmp
```

## 3. Expected Logs

- `run_id=...`
- `write step ...`
- `mem_status: target=/tmp;workdir=...;mem_shared_mb=...;mem_buff_cache_mb=...;mem_available_mb=...`
- `delete step ...`
- `hands-on completed`

## 4. Artifact Check

```bash
ls -lah artifacts/<run_id>/
cat artifacts/<run_id>/events.csv | head
```

## 5. Prometheus CSV Export

```bash
bash scripts/export_prometheus_csv.sh --run-id <run_id>
ls -lah artifacts/<run_id>/metrics.csv
```

## 6. Stop

```bash
make down
```
