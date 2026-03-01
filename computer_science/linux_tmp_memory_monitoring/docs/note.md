# notes

핸즈온하면서 중간 내용을 정리한 문서입니다.

## for loop with dd to /tmp directory

```bash
docker exec tmpfs-lab bash -lc 'mkdir -p /tmp/tmpfs-memory-manual'
for i in 1 2 3 4 5 6; do
  docker exec tmpfs-lab bash -lc "dd if=/dev/zero of=/tmp/tmpfs-memory-manual/chunk_${i}.bin bs=1M count=256 conv=fsync status=none"
  docker exec tmpfs-lab free -mh
  docker exec tmpfs-lab grep -E "MemTotal|MemAvailable|Shmem|Cached" /proc/meminfo
  sleep 15
done
               total        used        free      shared  buff/cache   available
Mem:            15Gi       1.2Gi        12Gi       256Mi       2.0Gi        14Gi
Swap:          1.0Gi          0B       1.0Gi
MemTotal:       16357000 kB
MemAvailable:   15126736 kB
Cached:          1505096 kB
SwapCached:            0 kB
Shmem:            263120 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
               total        used        free      shared  buff/cache   available
Mem:            15Gi       1.4Gi        12Gi       512Mi       2.2Gi        14Gi
Swap:          1.0Gi          0B       1.0Gi
MemTotal:       16357000 kB
MemAvailable:   14861060 kB
Cached:          1767368 kB
SwapCached:            0 kB
Shmem:            525268 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
               total        used        free      shared  buff/cache   available
Mem:            15Gi       1.7Gi        12Gi       768Mi       2.5Gi        13Gi
Swap:          1.0Gi          0B       1.0Gi
MemTotal:       16357000 kB
MemAvailable:   14608992 kB
Cached:          2029836 kB
SwapCached:            0 kB
Shmem:            787408 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
               total        used        free      shared  buff/cache   available
Mem:            15Gi       1.9Gi        12Gi       1.0Gi       2.8Gi        13Gi
Swap:          1.0Gi          0B       1.0Gi
MemTotal:       16357000 kB
MemAvailable:   14348144 kB
Cached:          2292192 kB
SwapCached:            0 kB
Shmem:           1049556 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
               total        used        free      shared  buff/cache   available
Mem:            15Gi       2.2Gi        11Gi       1.3Gi       3.0Gi        13Gi
Swap:          1.0Gi          0B       1.0Gi
MemTotal:       16357000 kB
MemAvailable:   14078884 kB
Cached:          2554544 kB
SwapCached:            0 kB
Shmem:           1311696 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
               total        used        free      shared  buff/cache   available
Mem:            15Gi       2.4Gi        11Gi       1.5Gi       3.3Gi        13Gi
Swap:          1.0Gi          0B       1.0Gi
MemTotal:       16357000 kB
MemAvailable:   13815292 kB
Cached:          2816908 kB
SwapCached:            0 kB
Shmem:           1573844 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
```
