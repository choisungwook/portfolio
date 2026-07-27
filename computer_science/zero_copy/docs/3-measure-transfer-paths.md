# Measuring the three transfer paths

`src/fileserver.c` sends the same file three ways and reports what each one
cost. Reading its output is the whole exercise: the syscall count is exact and
the system CPU time is where the removed copies show up.

Setup is in [1. Setup](./1-setup.md).

## Run all three paths

Each round starts a server, connects one client, transfers the file and exits.
Three rounds run by default because a single wall time on loopback is noisy.

```bash
docker compose exec lab /lab/scripts/bench.sh
```

Output from a 256 MB file looks like this.

```text
mode=readwrite bytes=256.0MB wall=114ms user_cpu=4ms sys_cpu=110ms syscalls=8192
mode=mmap      bytes=256.0MB wall=77ms  user_cpu=0ms sys_cpu=75ms  syscalls=1
mode=sendfile  bytes=256.0MB wall=101ms user_cpu=0ms sys_cpu=86ms  syscalls=1
```

## Reading the numbers

`syscalls` counts only the data-moving calls. `readwrite` needs 8192 of them
for 256 MB in 64 KB chunks, one read and one write per chunk. `mmap` and
`sendfile` need one call each because the loop moved into the kernel.

`sys_cpu` is the number to trust. `readwrite` burns roughly 1.5 times the
kernel CPU of the other two, and that gap is the page-cache-to-user-buffer copy
that `mmap` and `sendfile` never make. `user_cpu` stays near zero everywhere:
the process never computes anything, it only shuffles bytes.

Wall time moves around between rounds. On loopback the receiving `nc` process
competes with the server for the same CPU, so wall time measures the pair, not
the transfer path. Compare `sys_cpu` and `syscalls` across rounds and ignore
single wall numbers.

## Run one path at a time

The mode argument is `readwrite`, `mmap` or `sendfile`.

```bash
docker compose exec lab /lab/scripts/transfer.sh sendfile
```

## Confirm with strace

The program counts its own syscalls, so the count does not depend on a tracer.
To see the calls named by the kernel instead, append `strace`.

```bash
docker compose exec lab /lab/scripts/transfer.sh readwrite strace
docker compose exec lab /lab/scripts/transfer.sh sendfile strace
```

The summary shows thousands of `read` and `write` entries for the first
command, and a single `sendfile` entry for the second. `strace` needs
`SYS_PTRACE`, which `compose.yaml` already grants to the container.

## Try a different chunk size

`BUFFER_SIZE` in `src/fileserver.c` is 64 KB. Lowering it to 4 KB and
rebuilding makes the syscall count jump sixteenfold while the copied byte count
stays the same, which separates the two costs: mode switches and copies are not
the same thing.

```bash
docker compose up -d --build
```

## Next

- [4. What zero copy does not solve](./4-limits.md)
