> 이 글은 claude code가 작성했습니다.

# VPN 프로토콜과 협상 파라미터

이 문서는 AWS Site-to-Site VPN을 구축하고 운영할 때 알아야 하는 IPSec 프로토콜과 협상 파라미터를 정리합니다. 온프레미스 인프라팀과 기술 미팅을 할 때, 여기 있는 내용을 기반으로 이야기하면 됩니다.

---

## 1. IPSec VPN 연결 흐름

VPN 터널이 맺어지는 과정은 크게 두 단계입니다.

```
[IKE Phase 1]  양측이 서로를 인증하고, 안전한 통신 채널(IKE SA)을 만든다
      ↓
[IKE Phase 2]  그 채널 위에서 실제 데이터를 암호화할 규칙(IPSec SA)을 협상한다
      ↓
[데이터 전송]   IPSec SA를 통해 암호화된 트래픽이 오간다
```

Phase 1이 실패하면 Phase 2로 갈 수 없고, Phase 2가 실패하면 터널은 맺어졌지만 데이터가 흐르지 않습니다. VPN 트러블슈팅의 90%는 이 두 단계에서 양측 파라미터가 안 맞아서 생깁니다.

---

## 2. IKE Phase 1 파라미터

Phase 1에서는 "누구와 통신하는가"를 확인하고, 이후 협상을 보호할 암호화 채널을 만듭니다.

### 2.1 IKE 버전 (IKEv1 vs IKEv2)

| 항목 | IKEv1 | IKEv2 |
|------|-------|-------|
| 메시지 교환 | 6~9회 (Main/Aggressive Mode) | 4회 (단순화) |
| NAT-T 지원 | 별도 확장 필요 | 기본 내장 |
| EAP 인증 | 미지원 | 지원 |
| 재협상 | 복잡 | 간단 (CHILD_SA rekey) |
| AWS 권장 | 지원하지만 비권장 | **권장** |

AWS Site-to-Site VPN은 IKEv2를 기본으로 사용합니다. 온프레미스 장비가 IKEv1만 지원하면 AWS 콘솔에서 IKEv1으로 변경할 수 있지만, 가능하면 IKEv2를 쓰는 게 좋습니다.

```
# strongSwan 설정
keyexchange=ikev2
```

### 2.2 Local ID / Remote ID (leftid / rightid)

IKE Phase 1에서 가장 헷갈리는 파라미터입니다. 양측이 "나는 누구다"를 상대에게 알려주는 식별자입니다.

```
# strongSwan 설정 예시
leftid=43.203.181.249        # 내 쪽(온프레미스) 식별자
rightid=13.209.130.137       # 상대 쪽(AWS VGW) 식별자
```

**ID 유형:**

| 유형 | 예시 | 설명 |
|------|------|------|
| IP 주소 | `43.203.181.249` | 가장 일반적. Public IP를 ID로 사용 |
| FQDN | `vpn.mycompany.com` | 도메인 이름으로 식별. NAT 환경에서 유용 |
| User FQDN | `admin@mycompany.com` | 이메일 형태. 거의 안 씀 |

**AWS Site-to-Site VPN에서의 동작:**

- **AWS 콘솔에서 Local/Remote ID를 설정하는 옵션은 없습니다.** AWS는 자동으로 VPN 터널 endpoint의 Public IP를 자신의 ID로 사용하며, 변경할 수 없습니다.
- 설정이 필요한 곳은 **온프레미스 측(strongSwan)뿐**입니다.
  - `leftid`: Customer Gateway의 Public IP를 설정
  - `rightid`: AWS VPN 터널 endpoint의 Public IP를 설정 (VPN Configuration 파일에서 확인)
- 양측 ID가 안 맞으면 Phase 1이 실패합니다. 로그에 `NO_PROPOSAL_CHOSEN` 또는 `AUTHENTICATION_FAILED`가 찍힙니다.

**흔한 실수:**

- 온프레미스가 NAT 뒤에 있는데 Private IP를 leftid로 설정 → AWS가 보는 건 NAT된 Public IP라서 불일치
- VIP를 쓰는데 VIP가 아닌 실제 장비 IP를 leftid로 설정 → Customer Gateway IP와 불일치

**주의**: Local/Remote ID는 인증(Authentication) 용도입니다. "어디에 접근할 수 있는가"를 제어하는 건 아닙니다. 네트워크 격리는 별도로 해야 합니다. (자세한 내용은 [security.md](./security.md) 참고)

**혼동하기 쉬운 개념: Local/Remote ID vs Local/Remote IPv4 Network CIDR**

AWS 콘솔에서 "Local", "Remote"라는 이름이 두 곳에 나오기 때문에 헷갈릴 수 있습니다. 완전히 다른 설정입니다.

| 설정 | 용도 | IKE 단계 | strongSwan 대응 | 예시 |
|------|------|----------|----------------|------|
| Local/Remote **ID** | VPN endpoint **인증** (누구인가) | Phase 1 | `leftid` / `rightid` | `43.203.181.249` (Public IP) |
| Local/Remote **IPv4 Network CIDR** | VPN으로 통신하는 **네트워크 대역** | Phase 2 | `leftsubnet` / `rightsubnet` | `10.20.0.0/16` (온프레미스 대역) |

- **Local/Remote ID**: VPN 터널 양쪽 endpoint의 Public IP로, "이 터널의 상대방이 맞는가?"를 확인하는 인증 식별자
- **Local/Remote IPv4 Network CIDR**: VPN 터널을 통해 실제로 통신하는 네트워크 대역으로, "어떤 트래픽을 이 터널로 보낼 것인가?"를 정의하는 Traffic Selector

Local/Remote IPv4 Network CIDR에 대한 자세한 설명은 아래 3.3 Traffic Selector를 참고하세요.

### 2.3 인증 방식 (authby)

| 방식 | strongSwan 설정 | 설명 |
|------|----------------|------|
| Pre-Shared Key (PSK) | `authby=secret` | 양측이 동일한 비밀 키를 공유. 가장 간단 |
| 인증서 (Certificate) | `authby=rsasig` | PKI 기반. 보안성 높지만 인증서 관리 필요 |

AWS Site-to-Site VPN은 PSK를 기본으로 사용합니다. VPN Connection을 만들면 AWS가 터널별로 PSK를 자동 생성해줍니다. 원하면 직접 지정할 수도 있습니다.

```
# /etc/ipsec.secrets
43.203.181.249 13.209.130.137 : PSK "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

PSK 설정 시 주의할 점:
- 양측이 **정확히 동일한 PSK**를 사용해야 합니다. 공백이나 줄바꿈 하나라도 다르면 실패합니다.
- AWS에서 다운로드한 VPN Configuration 파일의 Pre-Shared Key를 그대로 복사해서 쓰면 됩니다.
- PSK가 맞지 않으면 로그에 `HASH_NOTIFY_FAILED` 또는 `AUTHENTICATION_FAILED`가 찍힙니다.

### 2.4 암호화 알고리즘 (IKE Phase 1)

Phase 1 채널을 보호하는 암호화 조합입니다. strongSwan에서는 `ike=` 파라미터로 설정합니다.

```
ike=aes128-sha1-modp1024!
```

이 한 줄이 세 가지를 정의합니다:

| 구성 요소 | 예시 값 | 의미 |
|-----------|---------|------|
| 암호화(Encryption) | `aes128` | 데이터 암호화 알고리즘 |
| 해시(Integrity) | `sha1` | 무결성 검증 알고리즘 |
| DH 그룹(Key Exchange) | `modp1024` | Diffie-Hellman 키 교환 그룹 |

**AWS가 지원하는 Phase 1 알고리즘:**

| 구성 요소 | 지원 값 | 권장 |
|-----------|---------|------|
| Encryption | AES128, AES256, AES128-GCM-16, AES256-GCM-16 | **AES256** 이상 |
| Integrity | SHA1, SHA2-256, SHA2-384, SHA2-512 | **SHA2-256** 이상 |
| DH Group | 2(modp1024), 14(modp2048), 15, 16, 17, 18, 19, 20, 21 | **14(modp2048)** 이상 |

> **실무 팁**: 이 프로젝트의 핸즈온에서는 `aes128-sha1-modp1024`를 사용했는데, 이건 AWS Configuration 파일이 기본으로 제안하는 값입니다. 실제 운영 환경에서는 `aes256-sha256-modp2048` 이상을 권장합니다. 온프레미스 장비가 지원하는지 확인하고 양측이 합의해야 합니다.

끝에 붙은 `!`(느낌표)는 strongSwan에서 "이 조합만 사용하고 다른 건 제안하지 마라"는 의미입니다. 이걸 안 붙이면 strongSwan이 여러 조합을 제안하면서 협상이 복잡해질 수 있습니다.

### 2.5 IKE Lifetime (ikelifetime)

Phase 1 SA의 유효 시간입니다. 이 시간이 지나면 SA를 재협상(rekey)합니다.

```
ikelifetime=28800s    # 8시간
```

- AWS 기본값: **28800초 (8시간)**
- 양측 값이 다르면 **더 짧은 쪽**이 적용됩니다.
- rekey가 일어나도 트래픽은 끊기지 않습니다. 새 SA를 만든 뒤 이전 SA를 삭제하는 방식(make-before-break)입니다.

---

## 3. IKE Phase 2 파라미터 (IPSec SA)

Phase 2에서는 실제 데이터를 암호화하는 규칙을 정합니다.

### 3.1 ESP 알고리즘

```
esp=aes128-sha1-modp1024!
```

Phase 1과 구조는 같지만, 실제 사용자 트래픽을 암호화하는 데 쓰입니다.

**AWS가 지원하는 Phase 2 알고리즘:**

| 구성 요소 | 지원 값 | 권장 |
|-----------|---------|------|
| Encryption | AES128, AES256, AES128-GCM-16, AES256-GCM-16 | **AES256** 이상 |
| Integrity | SHA1, SHA2-256, SHA2-384, SHA2-512 | **SHA2-256** 이상 |
| DH Group (PFS) | 2, 5, 14, 15, 16, 17, 18, 19, 20, 21 | **14** 이상 |

> **PFS(Perfect Forward Secrecy)**: Phase 2에서 DH 그룹을 지정하면 PFS가 활성화됩니다. PFS가 켜지면 Phase 2 rekey마다 새로운 키를 생성하므로, 하나의 세션 키가 노출되어도 다른 세션에는 영향이 없습니다.

### 3.2 IPSec SA Lifetime

```
lifetime=3600s    # 1시간
```

- AWS 기본값: **3600초 (1시간)**
- Phase 1보다 짧습니다. 실제 데이터를 보호하는 키이므로 더 자주 교체합니다.
- 마찬가지로 양측에서 짧은 값이 적용됩니다.
- rekey 시 트래픽 중단은 없습니다.

### 3.3 Traffic Selector (leftsubnet / rightsubnet)

VPN 터널을 통해 **어떤 네트워크 대역의 트래픽을 주고받을 것인가**를 정의합니다. AWS 콘솔에서는 **Local IPv4 Network CIDR** / **Remote IPv4 Network CIDR**이라는 이름으로 나옵니다.

**AWS 콘솔 설정과 strongSwan 매핑:**

| AWS 콘솔 | strongSwan | 의미 | 기본값 |
|----------|-----------|------|--------|
| Local IPv4 Network CIDR | `leftsubnet` | Customer Gateway 쪽 네트워크 대역 (온프레미스) | `0.0.0.0/0` |
| Remote IPv4 Network CIDR | `rightsubnet` | AWS 쪽 네트워크 대역 (VPC) | `0.0.0.0/0` |

```
# strongSwan 설정 - Route-based (VTI) 기본값
leftsubnet=0.0.0.0/0     # 온프레미스 쪽: 모든 대역
rightsubnet=0.0.0.0/0    # AWS 쪽: 모든 대역
```

**Route-based VPN(VTI)에서는 양쪽 다 `0.0.0.0/0`이 기본값입니다.** "모든 트래픽을 터널로 보낼 수 있다"로 열어두고, 실제 어떤 트래픽을 보낼지는 라우팅 테이블에서 결정하기 때문입니다.

**Policy-based VPN**에서는 특정 서브넷을 지정합니다:

```
# strongSwan 설정 - Policy-based
leftsubnet=10.20.0.0/16    # 온프레미스 대역
rightsubnet=10.10.0.0/16   # AWS 대역
```

이 경우 AWS 콘솔에서도 맞춰줘야 합니다:
- Local IPv4 Network CIDR = `10.20.0.0/16`
- Remote IPv4 Network CIDR = `10.10.0.0/16`

AWS Site-to-Site VPN은 기본적으로 Route-based(VTI)를 사용하므로, `0.0.0.0/0`이 일반적입니다.

> **온프레미스 장비가 Policy-based만 지원하는 경우**: Traffic Selector가 `0.0.0.0/0`이 아니면 AWS와 불일치가 발생할 수 있습니다. AWS 콘솔에서 VPN Tunnel Options의 Local/Remote IPv4 Network CIDR을 온프레미스에 맞게 조정해야 합니다. 이 값이 안 맞으면 Phase 2에서 `TS_UNACCEPTABLE` 에러가 발생합니다.

---

## 4. DPD (Dead Peer Detection)

상대방이 살아있는지 주기적으로 확인하는 메커니즘입니다. VPN HA에서 가장 중요한 파라미터입니다.

### 4.1 동작 원리

```
[내 장비] ---R-U-THERE (DPD request)---> [상대 장비]
[내 장비] <--R-U-THERE-ACK (DPD reply)-- [상대 장비]
```

- `dpddelay` 간격으로 R-U-THERE 메시지를 보냅니다.
- `dpdtimeout` 시간 동안 응답이 없으면 상대가 죽은 것으로 판단합니다.
- 판단 후 `dpdaction`에 따라 동작합니다.

### 4.2 파라미터

```
dpdaction=restart
dpddelay=10s
dpdtimeout=30s
```

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| `dpddelay` | `10s` | DPD 요청 전송 간격. 10초마다 한 번 "살아있나?" 확인 |
| `dpdtimeout` | `30s` | 이 시간 동안 응답 없으면 dead 판정 |
| `dpdaction` | `restart` | dead 판정 시 터널을 닫고 즉시 재연결 시도 |

**dpdaction 옵션:**

| Action | 동작 | 언제 쓰나 |
|--------|------|----------|
| `restart` | SA 삭제 후 즉시 재연결 | **권장**. Active/Standby에서 빠른 복구 |
| `clear` | SA만 삭제, 재연결 안 함 | AWS 기본값. 상대가 다시 연결해주길 기다림 |
| `none` | 아무것도 안 함 | 권장하지 않음 |

### 4.3 DPD와 Failover 시간 관계

```
최소 장애 감지 시간 = dpdtimeout = 30초
실제 Failover 시간 = 장애 감지 + SA 재협상 + 라우팅 수렴
                   ≈ 30초 + 5~15초 + α
                   ≈ 약 35~50초
```

dpddelay를 줄이면 더 자주 확인하니까 빨리 감지할 것 같지만, 실제로는 `dpdtimeout`이 감지 시간을 결정합니다. dpddelay는 "얼마나 자주 보내나"이고, dpdtimeout은 "얼마나 기다리나"입니다.

> **실무 팁**: DPD timeout을 10초로 줄이고 싶을 수 있지만, 인터넷 구간의 일시적 지연(jitter)으로 오탐이 날 수 있습니다. 30초가 합리적인 값이고, 20초 이하로 줄이려면 네트워크 품질을 먼저 확인하세요.

### 4.4 양측 DPD 설정 맞추기

AWS와 온프레미스의 DPD 설정이 다르면 비정상 동작이 생길 수 있습니다.

- AWS 기본: DPD interval 10초, timeout 30초, action `clear`
- 온프레미스(strongSwan): 위 설정을 맞춰주되, action은 `restart`가 좋습니다

AWS의 dpdaction이 `clear`이면 온프레미스가 죽었을 때 AWS는 SA만 삭제하고 기다립니다. 온프레미스의 dpdaction이 `restart`이면 AWS가 죽었을 때 온프레미스가 적극적으로 재연결을 시도합니다. 양측이 서로 다른 action을 쓰는 건 괜찮습니다.

---

## 5. MTU / MSS

VPN 터널은 원본 패킷에 IPSec 헤더를 추가하므로, MTU를 조정하지 않으면 패킷이 깨지거나 성능이 떨어집니다.

### 5.1 MTU 계산

```
일반 이더넷 MTU:      1500 bytes
IPSec 오버헤드:       ~ 50~70 bytes (ESP header + IV + padding + auth)
VTI 인터페이스 MTU:    1436 bytes (AWS 권장)
```

ipsec-vti-hook.sh에서 VTI 인터페이스를 만들 때 MTU를 1436으로 설정하는 이유입니다:

```sh
ip link set vti1 up mtu 1436
```

### 5.2 MSS Clamping

TCP의 MSS(Maximum Segment Size)를 VPN MTU에 맞게 줄여주는 설정입니다. 이걸 안 하면 TCP 패킷이 VPN 터널에서 fragmentation되거나 드롭될 수 있습니다.

```sh
iptables -t mangle -I FORWARD -o vti1 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
```

이 규칙은 TCP SYN 패킷의 MSS 값을 경로의 MTU에 맞게 자동으로 조정합니다.

> **증상**: VPN 연결은 되는데 SSH는 되고 SCP/HTTP 대용량 전송이 안 되면, MTU/MSS 문제일 가능성이 높습니다. ping은 작은 패킷이라 잘 되는데, 큰 데이터가 안 가는 경우입니다.

---

## 6. Replay Window

IPSec 패킷의 재전송 공격(replay attack)을 방지하는 메커니즘입니다.

```
replay_window=1024
```

- 각 IPSec 패킷에는 시퀀스 번호가 붙습니다.
- 수신 측은 최근 N개의 시퀀스 번호를 기억하고, 이미 받은 번호의 패킷은 버립니다.
- `1024`는 최근 1024개의 패킷을 추적한다는 의미입니다.

**window 크기가 너무 작으면**: 대역폭이 높거나 패킷 재정렬이 발생하는 환경에서 정상 패킷이 드롭될 수 있습니다.
**window 크기가 너무 크면**: 메모리 사용량이 늘어나지만, 보통 문제되지 않습니다.

AWS는 1024를 권장합니다. 대부분의 경우 이 값을 그대로 쓰면 됩니다.

---

## 7. NAT-Traversal (NAT-T)

온프레미스 VPN 장비가 NAT 뒤에 있을 때 필요한 기능입니다.

### 7.1 왜 필요한가

IPSec의 ESP 패킷은 UDP/TCP가 아니라 IP 프로토콜 50번을 사용합니다. NAT 장비는 UDP/TCP의 포트 번호를 변환하는데, ESP에는 포트 번호가 없어서 NAT를 통과할 수 없습니다.

NAT-T는 ESP 패킷을 UDP 4500번 포트로 감싸서 NAT를 통과할 수 있게 합니다.

```
NAT-T 미사용:  [IP][ESP][원본 데이터]           → NAT 통과 불가
NAT-T 사용:    [IP][UDP 4500][ESP][원본 데이터]  → NAT 통과 가능
```

### 7.2 설정

IKEv2에서는 NAT-T가 자동으로 감지되고 활성화됩니다. 별도 설정이 필요 없습니다.

온프레미스 방화벽에서 열어야 하는 포트:

| 프로토콜 | 포트 | 용도 |
|----------|------|------|
| UDP | 500 | IKE 협상 |
| UDP | 4500 | NAT-T (ESP over UDP) |
| IP Protocol | 50 | ESP (NAT 없는 환경) |

> **실무 팁**: 온프레미스 장비가 NAT 뒤에 있으면 UDP 4500이 열려 있는지 꼭 확인하세요. UDP 500만 열고 4500을 안 열어서 IKE는 되는데 데이터가 안 흐르는 경우가 많습니다.

---

## 8. Fragmentation과 MOBIKE

### 8.1 IKE Fragmentation

```
fragmentation=yes
```

IKE 패킷이 커서 IP fragmentation이 발생하면 일부 NAT/방화벽에서 드롭될 수 있습니다. `fragmentation=yes`를 설정하면 IKE 레벨에서 미리 분할하여 이 문제를 방지합니다.

### 8.2 MOBIKE

```
mobike=no
```

MOBIKE는 IKEv2에서 IP 주소가 변경되어도 SA를 유지하는 기능입니다. 모바일 장비에서 Wi-Fi ↔ LTE 전환 시 유용하지만, Site-to-Site VPN에서는 IP가 변할 일이 없으므로 끕니다.

AWS Site-to-Site VPN은 MOBIKE를 지원하지 않으므로 반드시 `no`로 설정해야 합니다.

---

## 9. VTI (Virtual Tunnel Interface)

이 프로젝트에서 사용하는 VPN 방식입니다. Policy-based와 비교해서 설명합니다.

### 9.1 Route-based VPN (VTI) vs Policy-based VPN

| 항목 | Route-based (VTI) | Policy-based |
|------|-------------------|-------------|
| 트래픽 선택 | 라우팅 테이블로 결정 | IPSec Policy(SP)로 결정 |
| Traffic Selector | `0.0.0.0/0` | 특정 서브넷 지정 |
| 인터페이스 | VTI 가상 인터페이스 생성 | 별도 인터페이스 없음 |
| BGP 사용 | 가능 (VTI 위에서 BGP) | 불가 |
| 다중 서브넷 | 라우팅으로 유연하게 추가 | 서브넷마다 SA 필요 |
| AWS 호환성 | **권장** | 지원하지만 제한적 |

AWS Site-to-Site VPN은 Route-based(VTI)를 권장합니다. VTI를 쓰면 라우팅 테이블로 트래픽을 제어하므로 유연하고, BGP와도 함께 쓸 수 있습니다.

### 9.2 VTI 내부 IP (Inside IP / Tunnel IP)

VPN 터널 안쪽의 point-to-point IP입니다. 169.254.x.x 대역(link-local)을 사용합니다.

```
# 터널 1
CGW_INSIDE_IP_TUNNEL1=169.254.144.26/30    # 온프레미스 쪽
VPG_INSIDE_IP_TUNNEL1=169.254.144.25/30    # AWS 쪽

# 터널 2
CGW_INSIDE_IP_TUNNEL2=169.254.9.222/30     # 온프레미스 쪽
VPG_INSIDE_IP_TUNNEL2=169.254.9.221/30     # AWS 쪽
```

- /30이므로 각 터널에 IP 2개(양측 1개씩)가 할당됩니다.
- BGP를 쓸 때는 이 IP가 BGP neighbor 주소가 됩니다.
- Static routing에서도 VTI 인터페이스에 이 IP를 설정해야 터널이 동작합니다.

### 9.3 SNAT 이슈

VTI의 Inside IP(169.254.x.x)는 link-local이라 AWS VPC 내부에서 라우팅할 수 없습니다. 온프레미스에서 AWS로 패킷을 보낼 때 source IP가 169.254.x.x이면 응답이 돌아올 수 없습니다.

그래서 ipsec-vti-hook.sh에서 SNAT을 합니다:

```sh
iptables -t nat -A POSTROUTING -o vti1 -j SNAT --to-source ${VPN_APPLIANCE_PRIVATE_IP}
```

VTI를 나가는 패킷의 source IP를 VPN Appliance의 실제 Private IP(10.20.x.x)로 바꿔주는 겁니다.

---

## 10. 온프레미스와 협상할 때 맞춰야 하는 파라미터 정리

기술 미팅 전에 양측이 합의해야 하는 파라미터 체크리스트입니다.

### 반드시 일치해야 하는 것

| 파라미터 | 불일치 시 증상 | 확인 방법 |
|----------|---------------|----------|
| IKE 버전 (v1/v2) | Phase 1 실패 | 양측 장비 사양서 |
| 암호화 알고리즘 (IKE) | Phase 1 실패, `NO_PROPOSAL_CHOSEN` | AWS 콘솔 Tunnel Options |
| 해시 알고리즘 (IKE) | Phase 1 실패 | AWS 콘솔 Tunnel Options |
| DH Group (IKE) | Phase 1 실패 | AWS 콘솔 Tunnel Options |
| Pre-Shared Key | Phase 1 실패, `AUTHENTICATION_FAILED` | VPN Configuration 파일 |
| Local/Remote ID | Phase 1 실패 | 양측 Public IP 확인 |
| 암호화 알고리즘 (ESP) | Phase 2 실패 | AWS 콘솔 Tunnel Options |
| 해시 알고리즘 (ESP) | Phase 2 실패 | AWS 콘솔 Tunnel Options |
| PFS DH Group | Phase 2 실패 | AWS 콘솔 Tunnel Options |

### 양측 중 짧은 값이 적용되는 것

| 파라미터 | AWS 기본값 | 권장 |
|----------|-----------|------|
| IKE Lifetime | 28800초 (8시간) | 양측 같게 |
| IPSec SA Lifetime | 3600초 (1시간) | 양측 같게 |

### 독립적으로 설정 가능한 것

| 파라미터 | 설명 |
|----------|------|
| DPD delay/timeout/action | 양측 다르게 설정 가능. 하지만 맞추는 게 좋음 |
| MTU | 각 측에서 독립 설정. 양측 모두 1436 권장 |
| Replay Window | 각 측에서 독립 설정. 1024 권장 |

---

## 11. 트러블슈팅 가이드

VPN이 안 될 때 단계별로 확인하는 순서입니다.

### Phase 1 실패

```sh
# strongSwan 로그 확인
journalctl -u strongswan-starter -f
```

| 로그 메시지 | 원인 | 조치 |
|------------|------|------|
| `NO_PROPOSAL_CHOSEN` | IKE 암호화/해시/DH 불일치 | 양측 알고리즘 확인 |
| `AUTHENTICATION_FAILED` | PSK 불일치 또는 ID 불일치 | PSK, leftid/rightid 확인 |
| `RETRANSMIT` 반복 | 상대 쪽에 도달 불가 | 방화벽에서 UDP 500/4500 확인 |
| `INVALID_KE_PAYLOAD` | DH Group 불일치 | DH Group 맞추기 |

### Phase 2 실패

| 로그 메시지 | 원인 | 조치 |
|------------|------|------|
| `NO_PROPOSAL_CHOSEN` (Phase 2) | ESP 암호화/해시/PFS 불일치 | ESP 알고리즘 확인 |
| `TS_UNACCEPTABLE` | Traffic Selector 불일치 | leftsubnet/rightsubnet 확인 |

### 연결은 되지만 트래픽이 안 흐름

| 증상 | 원인 | 조치 |
|------|------|------|
| ping 되는데 HTTP 안 됨 | MTU/MSS 문제 | MSS Clamping 확인, MTU 1436 확인 |
| 한쪽만 통신 | SNAT 미설정 또는 라우팅 누락 | iptables SNAT 규칙, route table 확인 |
| 간헐적 끊김 | DPD 오탐 또는 SA lifetime 불일치 | DPD timeout 조정, lifetime 맞추기 |
| VTI 인터페이스 없음 | ipsec-vti-hook.sh 실행 실패 | hook 스크립트 권한(chmod +x) 확인 |

---

## 12. AWS 콘솔에서 조정 가능한 터널 옵션

AWS 콘솔에서 VPN Connection을 만들거나 수정할 때, Tunnel Options에서 다음 파라미터를 조정할 수 있습니다.

| 카테고리 | 파라미터 | 기본값 |
|----------|----------|--------|
| Phase 1 | IKE Version | IKEv2 |
| Phase 1 | Phase 1 Encryption | AES128 |
| Phase 1 | Phase 1 Integrity | SHA1 |
| Phase 1 | Phase 1 DH Group | 2 |
| Phase 1 | Phase 1 Lifetime | 28800초 |
| Phase 2 | Phase 2 Encryption | AES128 |
| Phase 2 | Phase 2 Integrity | SHA1 |
| Phase 2 | Phase 2 DH Group | 2 |
| Phase 2 | Phase 2 Lifetime | 3600초 |
| DPD | DPD Timeout | 30초 |
| DPD | DPD Action | Clear |
| Tunnel | Startup Action | Add (수동) / Start (자동) |
| Tunnel | Rekey Margin Time | 540초 |
| Tunnel | Rekey Fuzz | 100% |
| Tunnel | Replay Window Size | 1024 |
| Network | Local IPv4 CIDR | 0.0.0.0/0 |
| Network | Remote IPv4 CIDR | 0.0.0.0/0 |

> **Startup Action**: `Add`는 온프레미스가 먼저 연결 시도해야 하고, `Start`는 AWS 측에서도 시도합니다. 온프레미스 장비가 준비되기 전에 AWS가 연결 시도하면 불필요한 로그가 쌓이므로, 보통 `Add`가 기본입니다.

## 참고자료

* [AWS Site-to-Site VPN Tunnel Options](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPNTunnels.html)
* [AWS VPN Cryptographic Algorithms](https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-tunnel-authentication-options.html)
* [strongSwan Configuration Reference](https://docs.strongswan.org/docs/5.9/config/connSection.html)
* [RFC 7296 - IKEv2](https://datatracker.ietf.org/doc/html/rfc7296)
* [RFC 3706 - DPD](https://datatracker.ietf.org/doc/html/rfc3706)
