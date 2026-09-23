---
type: Decision
title: Bottlerocket EC2는 저장소 terraform 규칙의 AMI, 볼륨 기본값을 따르지 않는다
description: Bottlerocket은 AMI 조회 방법과 볼륨 구조가 AL2023과 달라 aws_ami 필터, 30GB 루트 볼륨 규칙을 그대로 쓰면 틀린다.
tags: [bottlerocket, terraform, ec2]
timestamp: 2026-09-23T00:00:00Z
---

# Bottlerocket EC2는 저장소 terraform 규칙의 AMI, 볼륨 기본값을 따르지 않는다

## 결정

- AMI는 `data "aws_ami"` 이름 필터 대신 SSM public parameter `/aws/service/bottlerocket/<변형>/<arch>/<버전>/image_id`로 조회한다
- `root_block_device`에 `volume_size`를 주지 않는다. 크기를 바꾸는 대상은 `/dev/xvdb` 데이터 볼륨이다
- admin container SSH 비교 실습도 보안그룹 22번을 열지 않고 SSM port forwarding으로 붙인다
- 인스턴스는 핸즈온 command의 기본값 t4g.medium이다

## 이유

- Bottlerocket은 변형과 버전별로 SSM parameter를 게시한다. 버전 경로가 있어 A/B 업데이트 실습용 이전 버전을 고를 수 있다. 이름 필터로는 이전 버전 지정이 번거롭다
- Bottlerocket의 루트 디바이스는 A/B 파티션 세트가 든 OS 볼륨(AMI 스냅샷 2GiB)이다. 30GB로 키워도 쓰는 곳이 없고, 컨테이너 이미지가 쌓이는 곳은 xvdb다
- admin container는 host 네트워크에서 sshd를 띄우므로 SSM port forwarding으로 노드의 22번에 닿는다. SSH를 열지 않는 terraform 규칙을 지키면서 SSH 경로를 실습할 수 있다
