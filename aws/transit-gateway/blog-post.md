# 요약

- Transit은 **경유(환승)**라는 뜻이다. 공항 Transit 구역처럼, 네트워크 트래픽이 목적지로 가기 위해 **거쳐가는 중앙 허브**가 Transit Gateway이다.
- VPC Peering은 1:1 연결이다. VPC가 3개면 peering 3개, 10개면 peering 45개가 필요하다. **VPC가 늘어날수록 연결 수가 폭발적으로 증가**한다.
- PrivateLink는 **특정 서비스를 노출**하는 용도이다. VPC 간 전체 네트워크 통신이 아니라, 특정 엔드포인트만 공유한다.
- Transit Gateway는 **hub-and-spoke 구조**로, VPC가 몇 개든 각 VPC는 TGW에 1번만 연결하면 모든 VPC와 통신할 수 있다.

# 목차

1. [Transit이라는 단어의 의미](#1-transit이라는-단어의-의미)
2. [VPC 간 통신이 필요한 상황](#2-vpc-간-통신이-필요한-상황)
3. [방법 1: VPC Peering](#3-방법-1-vpc-peering)
4. [방법 2: PrivateLink](#4-방법-2-privatelink)
5. [방법 3: Transit Gateway](#5-방법-3-transit-gateway)
6. [세 가지 방법 비교](#6-세-가지-방법-비교)
7. [Transit Gateway 핵심 개념](#7-transit-gateway-핵심-개념)
8. [실습: 3개 VPC를 Transit Gateway로 연결하기](#8-실습-3개-vpc를-transit-gateway로-연결하기)
9. [실습 검증: VPC 간 ping 테스트](#9-실습-검증-vpc-간-ping-테스트)
10. [더 공부할 것](#10-더-공부할-것)
11. [참고자료](#11-참고자료)

# 1. Transit이라는 단어의 의미

Transit Gateway를 처음 보면 "Transit이 뭐지?"라는 의문이 생긴다. Transit이라는 단어 자체가 와닿지 않기 때문이다.

**Transit은 경유(환승)라는 뜻이다.**

해외여행을 해본 적이 있다면 공항에서 Transit이라는 단어를 봤을 것이다. 인천에서 런던으로 가는데 직항이 없으면 두바이를 **경유(Transit)**한다. 두바이에 도착해서 체류하는 게 아니라, 다른 비행기로 갈아타고 런던으로 간다.

[아키텍처 그림: 인천 → 두바이(Transit) → 런던 경유 비행 다이어그램]

네트워크에서도 마찬가지다.

**VPC A에서 VPC B로 트래픽을 보낼 때, Transit Gateway를 경유해서 도착한다.** Transit Gateway는 트래픽의 최종 목적지가 아니다. 트래픽이 거쳐가는 중앙 허브이다.

정리하면, Transit Gateway는 두 가지 단어를 합친 용어이다. Transit + Gateway

1. **Transit**: 경유, 환승. 트래픽이 거쳐간다는 의미
2. **Gateway**: 관문. 네트워크 간의 출입구
3. **Transit Gateway**: 여러 네트워크(VPC, VPN, Direct Connect)가 거쳐가는 **중앙 관문**

# 2. VPC 간 통신이 필요한 상황

AWS에서 VPC는 기본적으로 **격리된 네트워크**이다. VPC A와 VPC B는 같은 AWS 계정에 있어도 서로 통신할 수 없다.

그런데, 실무에서는 VPC 간 통신이 반드시 필요하다.

- 서비스 VPC에서 데이터베이스 VPC로 접근해야 한다
- 개발 VPC에서 공통 모니터링 VPC에 로그를 보내야 한다
- 온프레미스 네트워크에서 여러 VPC에 접근해야 한다

VPC가 2개일 때는 간단하다. 그런데 VPC가 3개, 5개, 10개로 늘어나면 어떻게 될까?

# 3. 방법 1: VPC Peering

## VPC Peering이란?

**VPC Peering은 두 VPC 간의 1:1 직접 연결이다.**

VPC A와 VPC B 사이에 peering을 맺으면, 두 VPC는 마치 같은 네트워크처럼 통신할 수 있다. AWS 내부 네트워크를 통해 트래픽이 전달되므로 인터넷을 거치지 않는다.

[아키텍처 그림: VPC A ↔ VPC B 1:1 Peering 연결]

## VPC가 3개일 때

VPC Peering은 1:1 연결이기 때문에, 3개 VPC가 서로 통신하려면 **3개의 peering 연결**이 필요하다.

```
VPC A ↔ VPC B  (peering 1)
VPC A ↔ VPC C  (peering 2)
VPC B ↔ VPC C  (peering 3)
```

[아키텍처 그림: 3개 VPC Full Mesh Peering 다이어그램]

## VPC가 늘어나면?

| VPC 수 | 필요한 Peering 수 | 공식 |
|--------|-------------------|------|
| 2 | 1 | |
| 3 | 3 | |
| 5 | 10 | |
| 10 | 45 | |
| 20 | 190 | N×(N-1)/2 |

**VPC가 늘어날수록 peering 수가 폭발적으로 증가한다.** 이것이 VPC Peering의 근본적인 한계이다.

관리해야 할 peering 연결이 많아지고, 각 VPC의 라우팅 테이블에 다른 모든 VPC의 CIDR을 추가해야 한다. VPC가 하나 추가될 때마다 기존 모든 VPC의 라우팅 테이블을 수정해야 한다.

## VPC Peering의 또 다른 한계: Transitive Routing 불가

VPC Peering에서 헷갈리면 안 되는 점이 있다.

VPC A ↔ VPC B peering이 있고, VPC B ↔ VPC C peering이 있다고 하자. **VPC A에서 VPC B를 경유해서 VPC C로 가는 것은 불가능하다.** 이것을 Transitive Routing이 안 된다고 한다.

```
VPC A → VPC B → VPC C   ← 이렇게 경유 불가!
VPC A → VPC C            ← 별도 peering 필요
```

반드시 VPC A ↔ VPC C 사이에 직접 peering을 맺어야 한다. 따라서 모든 VPC가 서로 통신하려면 full mesh 구조가 필수이다.

# 4. 방법 2: PrivateLink

## PrivateLink란?

PrivateLink는 VPC Peering과 근본적으로 다른 접근 방식이다.

**PrivateLink는 VPC 전체를 연결하는 것이 아니라, 특정 서비스(엔드포인트)만 노출한다.**

VPC B에 API 서버가 있다면, 이 API 서버를 NLB(Network Load Balancer) 뒤에 두고 PrivateLink로 노출한다. VPC A에서는 VPC Endpoint를 만들어서 이 서비스에 접근한다.

[아키텍처 그림: VPC A의 Endpoint → PrivateLink → VPC B의 NLB → API 서버]

## PrivateLink의 특징

- **단방향**: 서비스 제공자(Provider)와 소비자(Consumer)가 명확히 구분된다
- **서비스 단위 노출**: VPC 전체가 아닌, 특정 서비스만 접근 가능
- **네트워크 격리 유지**: 소비자 VPC에서 제공자 VPC의 다른 리소스는 볼 수 없다

## 왜 VPC 간 전체 통신에는 적합하지 않을까?

PrivateLink는 "이 서비스만 사용하세요"라는 용도이다. VPC 간 ICMP ping, 전체 IP 대역 통신, 양방향 자유로운 통신이 필요한 상황에는 맞지 않는다.

정리하면, PrivateLink는 **서비스 공유**에 적합하고, VPC 간 **네트워크 통합**에는 적합하지 않다.

# 5. 방법 3: Transit Gateway

## Transit Gateway란?

Transit Gateway(TGW)는 **중앙 허브**이다. 모든 VPC가 TGW에 연결(attach)하면, TGW를 경유해서 다른 VPC로 통신할 수 있다.

```
VPC A ─┐
VPC B ─┼─ Transit Gateway
VPC C ─┘
```

[아키텍처 그림: Hub-and-Spoke 구조 - 중앙 TGW에 3개 VPC 연결]

## VPC Peering과 비교하면?

VPC Peering이 point-to-point 직접 연결이라면, Transit Gateway는 **hub-and-spoke** 구조이다.

**VPC Peering (Full Mesh)**:
```
VPC A ←→ VPC B
VPC A ←→ VPC C
VPC B ←→ VPC C
= 3개 연결
```

**Transit Gateway (Hub-and-Spoke)**:
```
VPC A → TGW
VPC B → TGW
VPC C → TGW
= 3개 연결 (attachment)
```

3개일 때는 연결 수가 같다. 하지만 10개가 되면?

| VPC 수 | VPC Peering | Transit Gateway |
|--------|-------------|-----------------|
| 3 | 3 | 3 |
| 5 | 10 | 5 |
| 10 | 45 | 10 |
| 20 | 190 | 20 |

**Transit Gateway는 VPC 수만큼만 attachment가 필요하다.** 그리고 VPC가 하나 추가될 때, 기존 VPC의 설정을 변경할 필요가 없다. TGW에 새 VPC를 attach하고 라우팅만 추가하면 된다.

## Transit Gateway에서 Transitive Routing이 되는 이유

VPC Peering에서는 VPC A → VPC B → VPC C 경유가 불가능했다. 하지만 Transit Gateway에서는 가능하다.

왜냐하면 Transit Gateway가 **라우터 역할**을 하기 때문이다. TGW는 자체 라우팅 테이블을 가지고 있어서, VPC A에서 온 트래픽의 목적지가 VPC C의 CIDR이면 VPC C로 전달한다.

이것이 바로 **Transit(경유)**의 핵심이다. 모든 트래픽이 TGW를 경유하고, TGW가 목적지에 따라 올바른 VPC로 라우팅해준다.

# 6. 세 가지 방법 비교

| 항목 | VPC Peering | PrivateLink | Transit Gateway |
|------|-------------|-------------|-----------------|
| **연결 구조** | Point-to-Point (1:1) | Provider-Consumer | Hub-and-Spoke |
| **연결 수 (N개 VPC)** | N×(N-1)/2 | 서비스 수에 비례 | N |
| **Transitive Routing** | 불가 | 해당 없음 | 가능 |
| **통신 범위** | VPC 전체 CIDR | 특정 서비스만 | VPC 전체 CIDR |
| **통신 방향** | 양방향 | 단방향 (Consumer→Provider) | 양방향 |
| **VPN/Direct Connect 연동** | 불가 | 불가 | 가능 |
| **비용** | 무료 (데이터 전송비만) | 엔드포인트 시간당 + 데이터 | attachment 시간당 + 데이터 |
| **적합한 상황** | VPC 2-3개, 단순 연결 | 특정 서비스 공유 | 다수 VPC, 복잡한 네트워크 |

## 언제 무엇을 써야 할까?

- **VPC 2개만 연결**: VPC Peering이 가장 간단하고 비용도 없다
- **특정 서비스만 공유**: PrivateLink가 적합하다. 네트워크 격리를 유지하면서 필요한 서비스만 노출한다
- **VPC 3개 이상, 온프레미스 연결 포함**: Transit Gateway가 적합하다. 관리 복잡도를 낮추고 확장성이 좋다

# 7. Transit Gateway 핵심 개념

## TGW Attachment

**Attachment는 Transit Gateway에 네트워크를 연결하는 것이다.**

TGW에 연결할 수 있는 대상:
- **VPC**: 가장 일반적인 attachment
- **VPN**: Site-to-Site VPN 연결
- **Direct Connect Gateway**: 온프레미스 전용선 연결
- **Peering**: 다른 리전의 TGW와 연결

각 VPC attachment는 특정 subnet을 지정한다. TGW는 해당 subnet에 ENI(Elastic Network Interface)를 생성하여 트래픽을 주고받는다.

## TGW Route Table

Transit Gateway는 자체 라우팅 테이블을 가진다.

기본 동작은 **모든 attachment 간 통신 허용**이다. VPC A, B, C를 attach하면 기본 라우팅 테이블에 모든 VPC CIDR이 자동으로 등록(propagation)된다.

라우팅 테이블을 분리하면 세밀한 제어가 가능하다. 예를 들어, 개발 VPC끼리만 통신하고 운영 VPC와는 격리하는 구성이 가능하다.

## VPC 라우팅 테이블 설정

VPC에서 TGW로 트래픽을 보내려면, **VPC의 라우팅 테이블에도 경로를 추가**해야 한다.

```
목적지: 10.20.0.0/16 → 대상: Transit Gateway
목적지: 10.30.0.0/16 → 대상: Transit Gateway
```

VPC 라우팅 테이블에서 "다른 VPC CIDR로 가는 트래픽은 TGW로 보내라"고 설정하는 것이다.

# 8. 실습: 3개 VPC를 Transit Gateway로 연결하기

## 실습 아키텍처

[아키텍처 그림: 3개 VPC(A: 10.10.0.0/16, B: 10.20.0.0/16, C: 10.30.0.0/16)가 중앙 Transit Gateway에 연결된 Hub-and-Spoke 구조. 각 VPC에 EC2 인스턴스 1개씩 배치]

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   VPC A      │     │   VPC B      │     │   VPC C      │
│ 10.10.0.0/16 │     │ 10.20.0.0/16 │     │ 10.30.0.0/16 │
│              │     │              │     │              │
│  ┌────────┐  │     │  ┌────────┐  │     │  ┌────────┐  │
│  │ EC2-A  │  │     │  │ EC2-B  │  │     │  │ EC2-C  │  │
│  └────────┘  │     │  └────────┘  │     │  └────────┘  │
│       │      │     │       │      │     │       │      │
└───────┼──────┘     └───────┼──────┘     └───────┼──────┘
        │                    │                    │
        └────────────┬───────┘────────────────────┘
                     │
              ┌──────┴──────┐
              │   Transit   │
              │   Gateway   │
              └─────────────┘
```

## 실습 구성

- **VPC 3개**: 각각 다른 CIDR 대역
- **EC2 3개**: 각 VPC에 1개씩, ping 테스트용
- **Transit Gateway 1개**: 중앙 허브
- **TGW Attachment 3개**: 각 VPC를 TGW에 연결
- **SSM Session Manager**: EC2 접속용 (SSH 키 불필요)

실습자료는 저의 github에 있습니다.

## 핵심 Terraform 코드 설명

### Transit Gateway 생성

```hcl
resource "aws_ec2_transit_gateway" "main" {
  description                     = "${var.project_name} Transit Gateway"
  default_route_table_association = "enable"
  default_route_table_propagation = "enable"
  dns_support                     = "enable"

  tags = {
    Name = "${var.project_name}-tgw"
  }
}
```

`default_route_table_association`과 `default_route_table_propagation`을 enable하면, **VPC를 attach할 때 자동으로 기본 라우팅 테이블에 연결되고 경로가 전파**된다. 실습에서는 모든 VPC 간 통신을 허용할 것이므로 기본 설정을 사용한다.

### VPC Attachment

```hcl
resource "aws_ec2_transit_gateway_vpc_attachment" "vpc_a" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id
  vpc_id             = module.vpc_a.vpc_id
  subnet_ids         = module.vpc_a.private_subnets
}
```

각 VPC를 TGW에 연결한다. subnet_ids는 TGW가 ENI를 생성할 subnet을 지정한다.

### VPC 라우팅 테이블에 TGW 경로 추가

```hcl
resource "aws_route" "vpc_a_to_vpc_b" {
  route_table_id         = module.vpc_a.private_route_table_ids[0]
  destination_cidr_block = "10.20.0.0/16"
  transit_gateway_id     = aws_ec2_transit_gateway.main.id
}
```

VPC A의 라우팅 테이블에 "10.20.0.0/16으로 가는 트래픽은 TGW로 보내라"는 경로를 추가한다. 각 VPC마다 다른 VPC CIDR에 대한 경로를 추가해야 한다.

# 9. 실습 검증: VPC 간 ping 테스트

## SSM Session Manager로 EC2 접속

```bash
# VPC A의 EC2에 접속
aws ssm start-session --target <instance-id-a>

# VPC B의 EC2로 ping
ping 10.20.1.x

# VPC C의 EC2로 ping
ping 10.30.1.x
```

Transit Gateway를 통해 VPC A에서 VPC B, VPC C로 ping이 성공하면 실습 완료이다.

## 확인 포인트

1. **VPC A → VPC B**: ping 성공 확인
2. **VPC A → VPC C**: ping 성공 확인
3. **VPC B → VPC C**: ping 성공 확인
4. **양방향 통신**: 모든 방향에서 ping 성공 확인

# 10. 더 공부할 것

- TGW Route Table 분리: 개발/운영 VPC 격리 구성
- TGW + Site-to-Site VPN: 온프레미스 연결 통합
- TGW Peering: 멀티 리전 연결
- TGW Flow Logs: 트래픽 모니터링
- Appliance Mode: 방화벽/IDS를 TGW와 연동

# 11. 참고자료

- https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html
- https://docs.aws.amazon.com/vpc/latest/peering/what-is-vpc-peering.html
- https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ec2_transit_gateway
