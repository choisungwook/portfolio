---
type: Topic
title: Nitro Sandbox 메모리는 공식대로 MiB 단위까지 빠진다
description: memory pool 감소량을 실측해 confidential 546MiB, direct 514MiB로 공식과 일치함을 확인한 결과와 EKS의 대응값
tags: [nitro-sandboxes, capacity, ec2, eks]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-11T00:30:00Z }
---

`m7g.large`, `nitro_enclaves.mempool=2G@0`에서 512MiB Sandbox(`eth0`, vsock)를 띄우고 `mem_pool/free` 감소량을 쟀다.

| 모드 | 감소량 | 구성 |
|---|---|---|
| confidential | 546MiB | 512 + Sandbox당 2 + 디바이스 2개 × DMB 16 |
| direct | 514MiB | 512 + Sandbox당 2 |

- memory pool이 있어도 실행 중인 Sandbox 없이 4MiB가 먼저 빠져 있다.
- memory pool이 없으면 `free -m`에 7GiB가 비어 있어도 Firecracker가 `CMA allocation failed`로 끝난다.
- EKS RuntimeClass `isolated-sandbox`는 pod마다 `memory: 256Mi` overhead를 고정으로 더하고, Sandbox 노드(`c8a.large`)의 allocatable memory는 같은 크기 일반 노드보다 약 715Mi 작았다. 두 값의 내역은 확인 필요다.
- 용량 계획에 쓰는 방법은 [3-ec2-firecracker-sandbox.md](../../docs/3-ec2-firecracker-sandbox.md) 부록에 있다.
