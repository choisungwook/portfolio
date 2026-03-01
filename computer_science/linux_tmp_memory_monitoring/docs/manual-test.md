# Manual Test (No Script)

## 1. Stack Start

```bash
make up
```

## 2. Target Container Check

```bash
docker exec tmpfs-lab df -h /tmp
```

![manual_test_1](../imgs/manual_test_1.png "manual_test_1")

## 3. Baseline Metrics

```bash
docker exec tmpfs-lab free -mh
docker exec tmpfs-lab grep -E "MemTotal|MemAvailable|Shmem|Cached" /proc/meminfo
```

![manual_test_2](../imgs/manual_test_2.png "manual_test_2")

![manual_test_3](../imgs/manual_test_3.png "manual_test_3")

## 4. Write 256MB x N

```bash
docker exec tmpfs-lab bash -lc 'mkdir -p /tmp/tmpfs-memory-manual'
for i in 1 2 3 4 5 6; do
  docker exec tmpfs-lab bash -lc "dd if=/dev/zero of=/tmp/tmpfs-memory-manual/chunk_${i}.bin bs=1M count=256 conv=fsync status=none"
  docker exec tmpfs-lab free -mh
  docker exec tmpfs-lab grep -E "MemTotal|MemAvailable|Shmem|Cached" /proc/meminfo
  sleep 15
done
```

![manual_test_4](../imgs/manual_test_4.png "manual_test_4")

![manual_test_5](../imgs/manual_test_5.png "manual_test_5")

## 5. Delete Step

```bash
# (옵션1) 한번에 삭제
docker exec tmpfs-lab rm -rf /tmp/tmpfs-memory-manual
```

```bash
# (옵션2) 단계적 삭제
for i in 6 5 4 3 2 1; do
  docker exec tmpfs-lab bash -lc "rm -f /tmp/tmpfs-memory-manual/chunk_${i}.bin"
  docker exec tmpfs-lab free -mh
  docker exec tmpfs-lab grep -E "MemTotal|MemAvailable|Shmem|Cached" /proc/meminfo
  sleep 15
done
```

![manual_test_6](../imgs/manual_test_6.png "manual_test_6")
