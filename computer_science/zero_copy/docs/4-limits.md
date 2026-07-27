# What zero copy does not solve

`sendfile` is fast because the bytes never become visible to the process. Every
limitation follows from that one sentence.

## The process cannot touch the data

Compression, templating, checksums, per-request headers in the body — anything
that reads or edits the payload needs the bytes in user space, which is the
copy that was just removed. The usual answer is to write the transformed result
to a file or cache once and `sendfile` that file many times.

## TLS moves the copy instead of removing it

Encrypting a payload is touching it. A plain `sendfile` to a TLS socket does
not exist, which is why an HTTPS static file server loses the benefit that the
same server has over HTTP. Kernel TLS (`kTLS`) puts the encryption inside the
kernel so `sendfile` works again, and NICs with TLS offload push it further
down. Both need configuration and driver support, so the honest default
assumption is that TLS costs a copy.

## Small files barely notice

The saving is proportional to bytes moved. For a few kilobytes, connection
setup and the request round trip dominate and the copies are noise. The
technique is worth reaching for when the same process moves gigabytes.

## Errors are harder to see

Bytes that never reach user space also never reach a log line or a debugger.
Whatever visibility the transfer needs — byte counts, rate limiting, partial
failure handling — has to come from what the syscall returns.

## The neighbours of sendfile

| Call | Moves | Good for |
|---|---|---|
| `sendfile` | file to socket | static file serving |
| `splice` | any fd pair, via a pipe | proxying socket to socket |
| `vmsplice` | user pages into a pipe | handing owned pages to the kernel |
| `io_uring` | batched submission | many transfers with fewer mode switches |
| `MSG_ZEROCOPY` | user buffer to socket, no copy | large `send()` where the buffer can be pinned |

`sendfile` is the narrowest and the easiest to reason about. The others trade
that simplicity for a wider set of source and destination pairs.

## Where it already runs

Kafka reads log segments from the page cache and `sendfile`s them to consumers,
which is a large part of why a broker keeps up with disk-sized traffic on
modest CPU. nginx has `sendfile on` in its default static file path. Netty
exposes it as `FileRegion`, and Java as `FileChannel.transferTo`. In all of
them, enabling TLS or a filter in front of the payload quietly takes the
optimisation away.

## Back to the lab

The measurements in [3. Measuring the three transfer paths](./3-measure-transfer-paths.md)
show a kernel CPU gap on loopback, where no NIC is involved. On real hardware
with scatter-gather DMA the remaining kernel-side copy also disappears, so the
gap seen locally is the conservative half of the story.

## Cleanup

```bash
docker compose down -v
```
