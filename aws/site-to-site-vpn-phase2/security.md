> 이 글은 claude code가 작성했습니다.

# AWS Site-to-Site VPN 보안 분석

## 배경

외부 회사와 Site-to-Site VPN을 구축할 때, 가장 먼저 검토해야 할 것은 보안 아키텍처입니다. 이 문서에서 다루는 상황은 **같은 회사의 지사 간 연결이 아니라, 서로 이해관계가 없는 다른 회사들과 각각 VPN을 맺는 경우**입니다.

법적 요건 등으로 여러 외부 회사와 VPN을 연결해야 하는데, 이 회사들은 서로 전혀 관계가 없습니다. 따라서 다음 질문에 명확히 답할 수 있어야 합니다:

- A사가 B사의 네트워크에 접근할 수 없는가?
- 외부 회사에서 허용된 AWS 리소스 외에 다른 리소스에 접근할 수 없는가?
- VPN 설정만으로 이 격리가 보장되는가, 아니면 추가 보안 계층이 필요한가?

**결론부터 말하면, TGW 하나로 모든 외부 회사를 연결하고 회사별 전용 Route Table로 격리하는 것이 권장 방식입니다.** BGP를 쓰는 회사든 Static Routing을 쓰는 회사든, 하나의 TGW에서 모두 처리할 수 있습니다.

---

## 1. VGW의 구조적 한계

VGW(Virtual Private Gateway)로 여러 외부 회사를 연결하면 왜 보안 격리가 어려운지 이해하려면, VGW의 구조를 먼저 알아야 합니다.

### VGW에는 내부 라우팅 테이블이 없다

VGW의 가장 큰 한계는 **자체적인 라우팅 테이블이 없다**는 점입니다. VGW는 단순한 게이트웨이일 뿐, 트래픽을 필터링하거나 경로를 제한하는 기능이 없습니다.

```
온프레미스 → VPN 터널 → VGW → VPC (10.10.0.0/16 전체에 접근 가능)
```

온프레미스 VPN 장비가 VPC 대역(`10.10.0.0/16`) 어디로든 패킷을 보내면, VGW는 그대로 VPC에 전달합니다. "특정 IP로만 접근을 허용하겠다"는 제어를 VGW 레벨에서는 할 수 없습니다.

### Static IP Prefixes는 온프레미스 대역을 지정하는 설정이다

VPN Connection에서 설정하는 **Static IP Prefixes**가 온프레미스의 AWS 접근을 제어해줄 것 같지만, 실제로는 그렇지 않습니다.

Static IP Prefixes는 **온프레미스 네트워크 대역**을 AWS에 알려주는 설정입니다. "이 대역이 온프레미스에 있으니, AWS에서 이 대역으로 가는 트래픽은 VGW를 통해 보내라"는 의미입니다. 즉, **AWS → 온프레미스** 방향의 라우팅만 제어합니다.

```
Static IP Prefixes = 10.20.1.100/32 (온프레미스 서버 IP)

의미: "10.20.1.100으로 가는 트래픽은 VGW를 통해 온프레미스로 보내라"
     → VPC Route Table에 전파: 10.20.1.100/32 → VGW

제어하지 않는 것: 온프레미스 → AWS 방향의 트래픽 필터링
```

온프레미스에서 NAT 장비를 사용해서 VPN 터널에 private IP가 보이지 않는 경우에는, NATted IP를 `/32`로 Static IP Prefixes에 등록합니다. VPN 터널 안에서 AWS가 보는 source IP가 기준입니다.

### Route Propagation

VGW의 Static IP Prefixes를 VPC Route Table에 반영하려면 **Route Propagation**을 활성화해야 합니다. 이 설정은 기본적으로 비활성화되어 있습니다. VPC Route Table에서 수동으로 켜야 Static IP Prefixes가 자동으로 전파됩니다.

### VGW로 특정 목적지만 허용하는 것은 불가능

정리하면:

| 방향 | VGW에서 제어 가능? | 설명 |
|------|:---:|------|
| AWS → 온프레미스 | O | Static IP Prefixes로 라우팅 경로 제어 |
| 온프레미스 → AWS | **X** | 내부 라우팅 테이블이 없어 패킷 필터링 불가 |

온프레미스 → AWS 방향의 접근 제어는 VPC 레벨의 Security Group과 NACL에 의존해야 합니다. 게이트웨이 레벨에서 막을 수 없다는 것이 VGW의 근본적 한계입니다.

---

## 2. VPN CloudHub 리스크

### CloudHub란?

AWS VPN CloudHub는 **BGP 동적 라우팅이 전제 조건**입니다. 하나의 VGW에 여러 Customer Gateway(CGW)가 **BGP로 연결**되면, VGW가 각 사이트의 경로를 다른 모든 BGP 피어에게 재광고(re-advertise)합니다.

AWS 문서에서도 CloudHub 구성 조건을 명시하고 있습니다:
- 각 Customer Gateway에 **고유한 BGP ASN** 필요
- **동적으로 라우팅된**(BGP) Site-to-Site VPN 연결 생성
- 각 **BGP 피어**에서 경로를 수신하여 다시 공급

```
A사 (10.1.0.0/16, BGP ASN 65001) ── CGW ──┐
                                            ├── VGW ── VPC (10.10.0.0/16)
B사 (10.2.0.0/16, BGP ASN 65002) ── CGW ──┘
```

이 구성에서 VGW는 A사에게 B사의 경로(`10.2.0.0/16`)를, B사에게 A사의 경로(`10.1.0.0/16`)를 광고합니다. **서로 관계없는 회사끼리 통신 경로가 열리는 심각한 보안 문제**입니다.

### Static Routing이면 CloudHub가 성립하지 않는다

CloudHub는 BGP 재광고가 핵심 메커니즘이므로, **Static Routing만 사용하면 CloudHub 자체가 성립하지 않습니다.** 재광고할 BGP 프로토콜이 없기 때문입니다.

### 그렇다고 Static Routing이 완전히 안전한 것은 아니다

CloudHub 재광고는 없지만, VGW + Static 구성에서도 **회사 간 트래픽이 이론적으로 흐를 수 있는 경로가 존재**합니다.

```
A사 → VPN 터널 → VGW → VPC → VGW → VPN 터널 → B사
```

이 경로가 성립하려면 두 가지 조건이 동시에 충족되어야 합니다:

1. **VPC Route Table에 B사 대역이 존재**: B사 VPN Connection의 Static IP Prefixes(예: `10.2.0.0/16`)가 Route Propagation으로 VPC Route Table에 전파된 상태여야 합니다. VPC Route Table에 `10.2.0.0/16 → VGW` 경로가 있으면, VPC는 B사 대역으로 가는 트래픽을 VGW로 돌려보냅니다.
2. **A사가 B사의 IP 대역을 알아야 함**: BGP 재광고가 없으므로 A사는 B사의 대역을 자동으로 알 수 없습니다. 하지만 어떤 경로로든(실수, 내부 정보, 추측 등) 알게 되면 패킷을 보낼 수 있습니다.

VGW는 "이 패킷이 A사에서 왔으니 B사로 보내면 안 된다"는 판단을 하지 않습니다. 내부 라우팅 테이블이 없기 때문입니다. VGW는 패킷을 VPC로 전달하고, VPC Route Table이 B사 대역 → VGW 경로를 보고 다시 VGW로 보내면, VGW는 B사 터널로 내보냅니다.

현실적으로 두 조건이 동시에 충족될 가능성은 낮지만, 보안 관점에서 **"가능성이 낮다"와 "구조적으로 불가능하다"는 다릅니다.**

### TGW는 구조적으로 차단한다

TGW는 A사 전용 Route Table에 B사 경로가 아예 없으므로, A사가 B사 IP를 알아도 **Blackhole → 패킷 드롭**됩니다. 이것이 "게이트웨이 레벨 격리"의 의미입니다.

| 시나리오 | CloudHub 성립 | 회사 간 통신 가능성 | 격리 수준 |
|---------|:---:|:---:|------|
| VGW + BGP | **O** (재광고 발생) | 높음 (경로를 자동으로 알게 됨) | 낮음 |
| VGW + Static | X (BGP 없음) | 낮음 (IP를 알면 가능) | 중간 |
| TGW (BGP/Static 모두) | X (Route Table 분리) | **불가능** (Blackhole) | **높음** |

> 참고: https://docs.aws.amazon.com/vpn/latest/s2svpn/VPN_CloudHub.html

---

## 3. VPN Local ID / Remote ID로 격리할 수 있는가?

IPSec VPN에서 `leftid`(Local ID)와 `rightid`(Remote ID)는 IKE Phase 1에서 피어 인증에 사용되는 식별자입니다.

```
# strongSwan 설정 예시
conn tunnel1
    leftid=onprem-company-a
    rightid=aws-vpn-endpoint
```

Local/Remote ID가 하는 일:
- IKE 협상 시 올바른 피어와 연결되었는지 확인
- Pre-Shared Key 또는 인증서 기반 인증에서 올바른 자격 증명 선택

Local/Remote ID가 **하지 않는** 일:
- 네트워크 레벨의 트래픽 격리
- 라우팅 테이블의 경로 분리
- 특정 목적지로의 접근 제한

**Local/Remote ID는 "누구와 VPN을 맺었는가"를 확인하는 인증 메커니즘이지, "어디에 접근할 수 있는가"를 제어하는 도구가 아닙니다.**

---

## 4. TGW를 사용한 격리 (권장 방식)

### 왜 TGW인가?

TGW(Transit Gateway)는 VGW와 달리 **VPN 연결별로 독립적인 라우팅 테이블**을 할당할 수 있습니다. 이것이 보안 격리에서 결정적인 차이입니다.

VGW는 내부 라우팅 테이블이 없어서 온프레미스 → AWS 방향의 트래픽을 필터링할 수 없었습니다. TGW는 자체 Route Table이 있으므로, **게이트웨이 레벨에서 "이 VPN Connection은 이 목적지만 접근 가능"**이라는 제어가 가능합니다.

### TGW 하나로 충분하다

처음에는 "BGP를 쓰는 회사와 Static Routing을 쓰는 회사를 분리해서 TGW를 2개 만들어야 하나?"라는 고민이 있었습니다. 결론은 **TGW 하나면 충분합니다.**

TGW는 VPN Connection별로 별도의 Route Table을 할당하므로, BGP를 쓰는 회사든 Static Routing을 쓰는 회사든 같은 TGW에 연결해도 서로의 경로를 볼 수 없습니다. BGP를 준다는 것 자체가 보안 문제가 될 것 같지만, TGW Route Table 격리가 되어 있으면 문제없습니다.

```
A사 (BGP)    ── VPN ── TGW Attachment ── TGW Route Table (A사 전용)
B사 (Static) ── VPN ── TGW Attachment ── TGW Route Table (B사 전용)
C사 (BGP)    ── VPN ── TGW Attachment ── TGW Route Table (C사 전용)
                                │
                         하나의 TGW에 모두 연결
                         Route Table이 분리되어 있으므로 서로 격리됨
```

### TGW 격리 아키텍처

```
A사 ── VPN Connection ── TGW Attachment ── TGW Route Table (A사 전용)
                                                └── Static Route: 허용할 목적지 IP/32 → VPC Attachment
                                                └── (그 외 경로 없음 → Blackhole)

B사 ── VPN Connection ── TGW Attachment ── TGW Route Table (B사 전용)
                                                └── Static Route: 허용할 목적지 IP/32 → VPC Attachment
                                                └── (그 외 경로 없음 → Blackhole)

VPC ── VPC Attachment ── TGW Route Table (VPC 전용)
                              ├── Static Route: A사 대역 → A사 VPN Attachment
                              └── Static Route: B사 대역 → B사 VPN Attachment
```

A사 전용 Route Table에는 허용된 목적지 IP/32만 있고, B사의 경로는 없습니다. B사도 마찬가지입니다. **경로가 없으면 Blackhole이 되므로, 허용된 목적지 외의 AWS 리소스에는 도달 자체가 불가능**합니다. 이것이 VGW와의 결정적 차이입니다. VGW는 온프레미스 → AWS 패킷을 무조건 VPC로 전달하지만, TGW는 Route Table에 경로가 없으면 패킷을 드롭합니다.

### 핵심 설정

**1. TGW 생성 시 Default Route Table Association / Propagation 비활성화**

TGW를 생성할 때 반드시 기본 라우팅 테이블 자동 연결과 전파를 끕니다. 이렇게 해야 각 VPN 연결에 별도의 라우팅 테이블을 수동으로 지정할 수 있습니다.

**2. VPN 연결별 전용 TGW Route Table 생성**

각 회사의 VPN Attachment를 별도의 Route Table에 Associate합니다. Route Table 간에는 경로가 공유되지 않으므로, A사의 Route Table에서 B사의 네트워크 경로를 볼 수 없습니다.

**3. Route Propagation 비활성화, /32 Static Route 사용**

BGP를 쓰는 회사라도, 해당 회사 전용 TGW Route Table에서는 Route Propagation을 끄고 허용하고 싶은 목적지만 `/32` Static Route로 수동 등록합니다. 이렇게 하면 BGP로 경로를 받아도 TGW Route Table에 반영되지 않습니다.

```
TGW Route Table (A사 전용):
  10.10.1.50/32 → VPC Attachment   # 예: NLB IP
  10.10.1.51/32 → VPC Attachment   # 예: 다른 허용 대상
  (그 외 경로 없음 → Blackhole → 패킷 드롭)
```

### TGW Active/Standby도 문제없다

보안을 위해 TGW를 선택했는데, HA(고가용성)에서 문제가 생기지 않을까 걱정할 수 있습니다.

- **TGW + BGP**: Active/Active ECMP 지원
- **TGW + Static Routing**: Active/Standby 동작 (DPD 기반 Failover)

Static Routing을 쓰는 회사와 연결할 때 TGW Active/Standby는 VGW Active/Standby와 동일하게 동작합니다. DPD(Dead Peer Detection)로 장애를 감지하고, Standby 터널로 전환됩니다. Failover 시간은 약 10~30초로 VGW와 같습니다.

즉, **보안을 위해 TGW를 선택해도 HA 측면에서 손해 보는 것은 없습니다.**

---

## 5. VGW vs TGW 보안 격리 비교

| 항목 | VGW | TGW |
|-----|-----|-----|
| 자체 라우팅 테이블 | **없음** | 있음 (VPN별 전용 테이블) |
| 온프레미스→AWS 패킷 필터링 | **불가** (무조건 VPC로 전달) | **가능** (Route Table에 없으면 Blackhole) |
| 특정 목적지 /32로 접근 제한 | 불가 (게이트웨이 레벨) | **가능** (/32 Static Route만 등록) |
| CloudHub 재광고 차단 | Static 사용 시 부분적 | Route Table 분리로 완전 차단 |
| BGP + Static 회사 혼용 | 별도 VGW 필요 | **하나의 TGW로 처리** |
| Route Propagation 제어 | 제한적 | VPN별 개별 제어 |
| Active/Standby (Static) | DPD 기반 10~30초 | **동일** (DPD 기반 10~30초) |
| 비용 | VGW 무료 + VPN 과금 | TGW 시간당 + 데이터 처리 과금 |

---

## 6. 방어 심층(Defense-in-Depth)

TGW Route Table 격리가 1차 방어선이지만, 실제 운영에서는 다층 방어가 필요합니다.

### Layer 1: TGW Route Table 격리

- 회사별 전용 Route Table
- Route Propagation 비활성화
- 허용할 목적지만 /32 Static Route 등록 (예: NLB IP, 특정 서비스 IP)
- 경로가 없는 목적지는 Blackhole → 패킷 드롭

### Layer 2: Security Group

NLB와 백엔드 타겟에 Security Group을 적용합니다.

```
NLB Security Group:
  Inbound:
    - TCP 443 from 10.20.0.0/16 (A사 온프레미스 대역)
    - TCP 443 from 10.30.0.0/16 (B사 온프레미스 대역)
  Outbound:
    - 백엔드 타겟으로만 허용

Backend Target Security Group:
  Inbound:
    - NLB Security Group에서만 허용
```

### Layer 3: Network ACL (NACL)

NLB가 위치한 서브넷의 NACL로 추가 제어합니다. NACL은 Stateless이므로 Inbound와 Outbound 모두 명시적으로 설정해야 합니다.

```
NLB Subnet NACL:
  Inbound:
    Rule 100: Allow TCP 443 from 10.20.0.0/16
    Rule 110: Allow TCP 443 from 10.30.0.0/16
    Rule *:   Deny All

  Outbound:
    Rule 100: Allow TCP 1024-65535 to 10.20.0.0/16
    Rule 110: Allow TCP 1024-65535 to 10.30.0.0/16
    Rule *:   Deny All
```

### Layer 4: VPN 연결 로깅 및 모니터링

- VPN Connection 로깅 활성화 → CloudWatch Logs로 터널 상태, 연결 이벤트 전송
- VPC Flow Logs 활성화 → 비정상 트래픽 패턴 감지
- CloudWatch Alarm → 터널 DOWN 시 Slack 알림

---

## 7. VGW를 써야 하는 경우의 대안

TGW 비용이 허용되지 않아 VGW를 사용해야 하는 경우:

- **Static Route만 사용**: BGP를 사용하지 않으면 CloudHub 경로 재광고가 발생하지 않습니다. 다만 게이트웨이 레벨 격리는 불가하고, 회사 간 통신 경로가 이론적으로 존재합니다(2장 참고).
- **Security Group + NACL 강화**: VGW 레벨에서 온프레미스→AWS 트래픽을 막을 수 없으므로, Security Group과 NACL이 유일한 방어선이 됩니다. 허용할 source IP와 port를 최소한으로 제한해야 합니다.

VGW는 VPC에 1:1로 종속되므로(VPC당 VGW 1개), 회사별로 VGW를 분리하는 것은 회사별 VPC를 만들어야 한다는 의미입니다. 현실적이지 않으므로, 여러 외부 회사를 연결해야 한다면 TGW가 사실상 유일한 선택지입니다.

---

## 결론

| 방식 | 격리 수준 | 비용 | 권장 상황 |
|-----|----------|------|----------|
| VGW 1개 공유 (BGP) | 낮음 | 낮음 | 같은 회사 지사끼리만 |
| VGW 1개 공유 (Static) | 중간 | 낮음 | 비권장 (SG/NACL이 유일한 방어선) |
| **TGW 1개 + 회사별 전용 Route Table** | **높음** | 중간~높음 | **서로 다른 회사 연결 시 권장** |

**최종 권장**: 서로 관계없는 외부 회사들과 Site-to-Site VPN을 여러 개 구축할 때는 **TGW 하나**를 사용합니다. BGP를 쓰는 회사든 Static Routing을 쓰는 회사든 같은 TGW에 연결하고, **회사별 전용 Route Table을 생성하여 Route Propagation을 비활성화하고, 허용할 목적지만 /32 Static Route로 등록**합니다. 여기에 Security Group, NACL, VPN 로깅을 결합하면 방어 심층 전략이 완성됩니다.

## 참고자료

* https://docs.aws.amazon.com/vpn/latest/s2svpn/VPN_CloudHub.html
* https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-concentrator.html
