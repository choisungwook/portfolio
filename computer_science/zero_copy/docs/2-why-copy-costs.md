# Why copying is the cost

Sending a file over a socket does not move bytes once. In the naive path the
same bytes are copied four times and the CPU pays for two of those copies.
Zero copy is the family of syscalls that removes the copies the CPU does not
need to make.

Setup is in [1. Setup](./1-setup.md).

## What happens in read() plus write()

A file server that reads into a buffer and writes it to a socket asks the
kernel to do this per chunk.

| Step | Copy | Who does it |
|---|---|---|
| 1 | disk to page cache | DMA engine |
| 2 | page cache to user buffer | CPU |
| 3 | user buffer to socket buffer | CPU |
| 4 | socket buffer to NIC | DMA engine |

The DMA copies are unavoidable: data has to enter and leave the machine. Copies
2 and 3 exist only because the bytes had to visit user space, and the process
never looks at them. Each chunk also crosses the user/kernel boundary twice, so
a 512 MB file sent in 64 KB chunks means 16384 syscalls.

## What the shorter paths remove

`mmap` plus `write` maps the page cache into the address space, so step 2
disappears. The bytes still get copied into the socket buffer.

`sendfile` never names a user buffer at all. The file descriptor and the socket
descriptor are handed to the kernel, which moves pages from the page cache to
the socket in one call. Steps 2 and 3 collapse into one kernel-side copy.

On hardware whose NIC supports scatter-gather DMA, `sendfile` degrades that
last copy further: the kernel appends page descriptors to the socket buffer and
the NIC reads the page cache directly. That is the case people mean by "true
zero copy" — the CPU copies nothing.

## What this buys

Fewer copies means less memory bandwidth and less CPU spent in kernel mode.
Fewer syscalls means fewer mode switches. Neither makes the network faster, so
on a saturated link the gain shows up as CPU headroom rather than throughput.
This is why the technique matters most to processes whose whole job is moving
bytes: Kafka brokers, nginx serving static files, object storage front ends.

## Next

- [3. Measuring the three transfer paths](./3-measure-transfer-paths.md)
