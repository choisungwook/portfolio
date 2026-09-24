---
type: Decision
title: 실습 환경을 docker와 EC2(AL2023 x86_64)로 나눈다
description: SELinux와 dm-verity 커널 동작은 host 커널이 필요해 EC2에서, dm-verity 해시 트리 계산은 docker에서 한다.
tags: [selinux, dm-verity, docker, ec2]
timestamp: 2026-09-24T00:00:00Z
---

# 실습 환경을 docker와 EC2(AL2023 x86_64)로 나눈다

## 결정

- dm-verity의 `veritysetup format`, `verify`, 해시 트리 재계산은 docker compose로 한다
- SELinux 전체와 `veritysetup open`(커널 device-mapper) 실습은 EC2 t3.medium, AL2023 x86_64에서 한다
- OS는 SELinux가 기본 enforcing인 Fedora 대신 AL2023을 쓴다
- docker 이미지는 Docker Hub의 `debian:trixie-slim`이다

## 이유

- SELinux는 컨테이너가 아니라 host 커널의 LSM이다. M3 Mac의 Docker Desktop VM 커널은 SELinux가 켜져 있지 않아 컨테이너 안에서 정책을 적재하거나 enforcing으로 바꿀 수 없다
- `veritysetup format`과 `verify`는 파일만 읽고 쓰는 사용자 공간 동작이라 커널 없이 된다. `open`만 device-mapper와 loop device가 필요하다
- AL2023은 permissive가 기본이라 enforcing 전환 전후를 같은 머신에서 비교할 수 있다. Bottlerocket과 같은 Amazon 배포판이라 비교하기도 쉽다
- 사용자가 x86 t3.medium을 지정해 저장소 기본값 t4g 대신 `arch = x86_64`를 기본으로 뒀다
- 작성 환경에서 Docker Hub가 429, ECR public mirror가 egress 정책으로 거부되어 compose 빌드를 돌려 보지 못했다. 같은 명령은 veritysetup 2.7.0에서 직접 실행해 결과를 확인했다

## Citations

1. AL2023 SELinux 기본 모드: https://docs.aws.amazon.com/linux/al2023/ug/selinux-modes.html
2. AL2023 docker와 container-selinux 의존성: https://github.com/amazonlinux/amazon-linux-2023/issues/754
