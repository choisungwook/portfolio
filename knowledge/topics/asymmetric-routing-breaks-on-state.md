---
type: Topic
title: 비대칭 라우팅은 경로가 아니라 상태 때문에 깨진다
description: 가는 길과 오는 길이 달라도 IP는 상관하지 않는다. 두 경로 중 한쪽에만 상태를 가진 장비가 있을 때만 통신이 끊긴다.
tags: [network, routing, linux, aws]
timestamp: 2026-07-27T00:00:00Z
---

## 통찰

라우팅은 방향마다 따로 결정된다. 가는 길은 클라이언트의 테이블이, 오는 길은 서버의 테이블이 정하고 둘은 서로를 참조하지 않는다. 그래서 비대칭은 고장이 아니라 기본 성질이고, 경로가 하나뿐일 때만 우연히 대칭이 된다.

끊기는 조건은 경로가 갈리는 것 자체가 아니라 **두 경로 중 한쪽에만 상태를 기억하는 장비가 있는 것**이다. 진단은 "패킷이 어디서 사라졌나"가 아니라 "두 방향의 경로를 그리고, 한쪽에만 있는 상태 장비를 찾는다" 순서로 한다.

상태를 가진 것들:

| 장비 | 끊기는 방식 |
| --- | --- |
| stateful 방화벽, conntrack | SYN을 못 본 장비에게 SYN-ACK는 소속 없는 패킷 |
| NAT | 매핑을 만든 장비를 우회해 돌아오면 되돌릴 주체가 없음 |
| rp_filter strict | 되돌아갈 경로가 들어온 인터페이스가 아니면 커널이 버림 |
| 클라우드 ENI 출발지 검사 | 자기 주소가 아닌 출발지의 패킷을 내보내지 못함 |

## 재현할 때 걸리는 함정

리눅스 라우터로 재현하면 통신이 그냥 된다. `nf_conntrack_tcp_loose=1`이 기본값이라 conntrack이 SYN을 놓친 흐름도 중간부터 주워 담기 때문이다. 방화벽 제품은 이 동작을 꺼 두므로, 재현하려면 `nf_conntrack_tcp_loose=0`으로 바꿔야 실무와 같은 증상이 나온다. 이걸 모르면 "로컬에서는 재현이 안 된다"에서 막힌다.

## 해법의 성격

두 가지뿐이고 성격이 다르다.

* 라우팅을 대칭으로 맞춘다. 출발지 주소가 보존되지만 상대 조직의 협조가 필요하다.
* NAT으로 출발지를 바꿔 오는 길을 강제한다. 상대는 경로 한 줄만 추가하면 되지만, 상대가 클라이언트를 주소로 구분하지 못하게 된다.

AWS private NAT gateway가 두 번째다. 라우팅 테이블을 고치는 게 아니라 질문을 "우리 VPC 대역 전체를 되돌려 줄 수 있는가"에서 "우리가 고른 작은 대역 하나만 되돌려 줄 수 있는가"로 바꾼다. RFC 6598(100.64.0.0/10)을 secondary CIDR로 쓰는 패턴이 반복되는 이유는 상대 네트워크와 겹칠 확률이 가장 낮아 승인받기 쉽기 때문이다.

대가는 NAT이 stateful 병목이 된다는 것이다. 이후 어떤 경로 변경이든 응답이 NAT을 우회하게 만들면 다시 끊긴다.

## 관련

* 핸즈온: [computer_science/asymmetric_routing](../../computer_science/asymmetric_routing/README.md)

## Citations

1. RFC 3704 - Ingress Filtering for Multihomed Networks
2. RFC 6598 - IANA-Reserved IPv4 Prefix for Shared Address Space
3. AWS, Building a Scalable and Secure Multi-VPC Network Infrastructure - Private NAT Gateway
