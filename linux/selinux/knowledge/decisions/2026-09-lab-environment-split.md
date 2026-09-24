---
type: Decision
title: SELinux는 EC2에서만, dm-verity는 Docker와 EC2 두 단계로 실습한다
description: Docker Desktop VM 커널은 SELinux를 켤 수 없고 dm-verity 커널 target도 보장되지 않아 실습 환경을 기능별로 나눴다.
tags: [selinux, dm-verity, docker, ec2]
timestamp: 2026-09-24T00:00:00Z
---

# SELinux는 EC2에서만, dm-verity는 Docker와 EC2 두 단계로 실습한다

## 결정

- SELinux 실습은 Amazon Linux 2023 t3.medium(x86_64)에서만 한다
- dm-verity는 Docker에서 `veritysetup verify`로 해시 트리와 변조 탐지를, EC2에서 커널 target의 EIO와 재부팅을 본다
- OS는 AL2023이다. Ubuntu는 AppArmor라 `var.os_type`을 두지 않는다

## 이유

- SELinux는 커널 LSM이다. 컨테이너는 Docker Desktop VM 커널을 공유하고 그 커널은 SELinux를 켜고 부팅하지 않는다
- `veritysetup verify`는 커널 없이 해시를 계산해 privileged 없이도 돈다. 작성 환경처럼 `dm_mod`가 없는 커널에서도 확인된다
- AL2023은 SELinux가 permissive로 켜져 있어 enforcing 전환 자체를 실습 1단계로 쓸 수 있다. 사용자가 x86 t3.medium을 지정했다
