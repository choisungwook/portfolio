> 이 글은 claude code가 작성했습니다.

# AWS Site-to-Site VPN 고가용성 (HA) 전략

AWS Site-to-Site VPN을 운영 환경에서 사용할 때, 터널 장애와 유지보수 상황에 대한 HA 전략은 필수입니다. 이 문서는 VGW Active/Standby, TGW Active/Standby, TGW Active/Active(ECMP) 세 가지 아키텍처의 장애 조치(failover) 동작을 비교하고, AWS 측과 온프레미스 측 각각의 관점에서 장애 시나리오를 분석합니다.

---

## 1. 아키텍처별 HA 동작

### 1.1 VGW Active/Standby

VGW(Virtual Private Gateway)는 Site-to-Site VPN 생성 시 **두 개의 터널**을 제공합니다. 하지만 VGW는 한쪽 터널만 Active로 사용하고, 나머지 터널은 Standby 상태로 유지합니다.

| 항목 | 설명 |
|------|------|
| 터널 수 | 2개 (Active 1, Standby 1) |
| 트래픽 분산 | 불가 (Active 터널로만 트래픽 전달) |
| Failover 트리거 | DPD(Dead Peer Detection) timeout 감지 |
| Failover 소요 시간 | **10~30초 이상** (DPD timeout + 라우팅 수렴 시간) |
| BGP 사용 시 | BGP keepalive/hold timer에 따라 경로 철회 후 Standby 전환 |
| Static routing 사용 시 | DPD timeout 후 AWS가 Standby 터널로 전환 |

**핵심 포인트**: VGW는 ECMP를 지원하지 않으므로, 두 터널을 동시에 활용한 부하 분산이 불가능합니다. Failover 시 반드시 트래픽 중단 구간(blackhole)이 발생합니다.

### 1.2 TGW Active/Standby (Static Routing)

TGW에서 **Static Routing**을 사용하면, VGW와 동일하게 **Active/Standby**로 동작합니다. ECMP는 BGP가 있어야 동작하므로, Static Routing에서는 한 터널만 Active이고 나머지는 Standby입니다.

| 항목 | 설명 |
|------|------|
| 터널 수 | 2개 (Active 1, Standby 1) |
| 트래픽 분산 | 불가 (Active 터널로만 트래픽 전달) |
| Failover 트리거 | DPD(Dead Peer Detection) timeout 감지 |
| Failover 소요 시간 | **10~30초 이상** (VGW Active/Standby와 동일) |
| BGP 필요 여부 | 불필요 (Static Routing) |

**핵심 포인트**: Failover 동작은 VGW Active/Standby와 동일합니다(DPD 기반, 10~30초). 차이는 HA가 아니라 **보안**에 있습니다. TGW는 회사별 전용 Route Table로 접근을 제한할 수 있지만, VGW는 불가합니다. 보안이 필요해서 TGW를 선택했는데 Static Routing을 써야 하는 상황이라면, HA 측면에서 손해 보는 것은 없습니다.

### 1.3 TGW Active/Active (ECMP + BGP)

TGW에서 **BGP**를 사용하고 ECMP(Equal-Cost Multi-Path)를 활성화하면 **두 터널을 동시에 Active**로 사용할 수 있습니다.

| 항목 | 설명 |
|------|------|
| 터널 수 | 2개 (Active 2) |
| 트래픽 분산 | ECMP로 두 터널에 부하 분산 |
| Failover 트리거 | BGP 경로 철회 또는 DPD timeout |
| Failover 소요 시간 | **거의 즉시** (살아있는 터널로 즉시 전환) |
| 대역폭 | 터널 2개 합산 가능 (터널당 최대 1.25Gbps) |
| BGP 필요 여부 | **필수** |

**핵심 포인트**: TGW ECMP 환경에서 한 터널이 다운되면, 나머지 터널이 이미 Active 상태이므로 트래픽이 즉시 나머지 터널로 흐릅니다. Failover 시 체감 중단 시간이 거의 없습니다. 단, 온프레미스에서 BGP를 지원해야 합니다.

### 1.4 비교 요약

| 비교 항목 | VGW (Active/Standby) | TGW (Active/Standby) | TGW (Active/Active ECMP) |
|-----------|---------------------|---------------------|--------------------------|
| 라우팅 방식 | BGP 또는 Static | Static | **BGP 필수** |
| 동시 Active 터널 | 1개 | 1개 | 2개 |
| Failover 중단 시간 | 10~30초+ | 10~30초+ | 거의 0초 |
| 트래픽 분산 | 불가 | 불가 | 가능 |
| 대역폭 | 터널 1개분 (1.25Gbps) | 터널 1개분 (1.25Gbps) | 터널 2개분 (2.5Gbps) |
| 보안 격리 | 불가 (내부 Route Table 없음) | **가능** (회사별 Route Table) | **가능** (회사별 Route Table) |
| 비용 | VGW 자체는 무료 | TGW attachment + 데이터 처리 | TGW attachment + 데이터 처리 |
| 적합한 상황 | 단순한 단일 VPC 연결 | 보안 격리 필요 + BGP 미지원 | 고가용성 + 보안 격리 필수 환경 |

---

## 2. Failover 상세 분석: 관점별

### 2.1 AWS 측 관점

#### 시나리오: AWS VPN 엔드포인트(터널)가 다운될 때

AWS VPN 엔드포인트는 AWS가 관리하는 인프라입니다. 엔드포인트 장애 시 동작은 다음과 같습니다:

**VGW 환경:**
1. Active 터널의 AWS 엔드포인트가 다운
2. VGW가 DPD timeout으로 터널 장애 감지 (기본 DPD interval: 10초, 3회 실패 시 = ~30초)
3. VGW가 Standby 터널을 Active로 전환
4. BGP 사용 시: BGP hold timer(기본 90초) 만료 전에 DPD가 먼저 감지하는 것이 일반적
5. VPC route table의 경로가 새 Active 터널로 업데이트됨
6. **총 중단 시간: 약 10~30초** (이상적인 경우), 실제로는 1분 이상 걸릴 수 있음

**TGW Active/Standby 환경 (Static Routing):**
1. Active 터널의 AWS 엔드포인트가 다운
2. TGW가 DPD timeout으로 터널 장애 감지
3. TGW가 Standby 터널을 Active로 전환
4. TGW route table의 경로가 새 Active 터널로 업데이트됨
5. **총 중단 시간: 약 10~30초** (VGW Active/Standby와 동일)

**TGW Active/Active 환경 (ECMP + BGP):**
1. 터널 하나의 AWS 엔드포인트가 다운
2. BGP가 해당 터널의 경로를 철회
3. ECMP 테이블에서 해당 터널 경로가 제거됨
4. 나머지 Active 터널이 이미 트래픽을 처리 중이므로 전환 지연 없음
5. **총 중단 시간: 수 초 이내**

#### AWS 측에서 확인할 사항

- CloudWatch `TunnelState` 메트릭으로 각 터널의 UP/DOWN 상태 모니터링
- VPN Connection 상세 페이지에서 터널별 상태 확인
- TGW route table에서 BGP propagation 경로가 정상적으로 업데이트되었는지 확인

### 2.2 온프레미스 측 관점

#### 시나리오: 온프레미스 VPN 장비가 다운될 때

**단일 장비 구성:**
1. 온프레미스 VPN 장비(예: strongSwan)가 다운
2. AWS 측에서 DPD timeout으로 감지
3. **두 터널 모두 다운** (단일 장비이므로)
4. VPN 장비가 복구될 때까지 VPN 통신 불가
5. 장비 복구 후 IPSec SA 재협상 + BGP 세션 재수립 필요
6. **총 중단 시간: 장비 복구 시간 + IPSec/BGP 재수립 시간**

**Active/Standby 이중 장비 구성 (VIP 사용):**

파트너사가 두 대의 VPN 장비를 VIP(Virtual IP)로 Active/Standby 구성하는 경우:

1. Active 장비 장애 발생
2. VIP가 Standby 장비로 전환 (VRRP/HSRP 등, ~1~3초)
3. 새 Active 장비가 IPSec SA를 재협상 시작
4. IKE Phase 1 + Phase 2 재수립 (~5~15초)
5. BGP 세션 재수립 + 경로 교환 (~10~30초)
6. **총 중단 시간: VIP 전환 + IPSec 재수립 + BGP 수렴 = 약 20초~1분+**

> **현실적인 평가**: 파트너사가 "장애 없다"고 주장하더라도, VIP 전환 + IPSec 재협상 + BGP 수렴까지 합산하면 **최소 20~60초의 트래픽 중단**이 발생합니다. 특히 IPSec SA는 stateful하므로, 장비 전환 시 기존 SA가 무효화되고 새로 협상해야 합니다. 이 시간을 "장애 없음"이라고 표현하는 것은 과장입니다.
>
> 다만, 일부 고급 방화벽/VPN 장비(Palo Alto, Fortinet 등)는 HA sync 기능으로 IPSec SA 상태를 Standby에 동기화하여 재협상 없이 전환할 수 있습니다. 이 경우 중단 시간이 1~3초로 단축될 수 있지만, 온프레미스 장비의 HA sync 구성 여부를 반드시 확인해야 합니다.

---

## 3. DPD (Dead Peer Detection) 상세

DPD는 IPSec VPN에서 상대방의 생존 여부를 확인하는 메커니즘입니다. Failover 시간에 직접적인 영향을 미치므로 정확히 이해해야 합니다.

### 3.1 DPD 동작 원리

```
[Peer A] ---DPD R-U-THERE---> [Peer B]
[Peer A] <--DPD R-U-THERE-ACK--- [Peer B]
```

- DPD는 일정 간격(interval)으로 R-U-THERE 메시지를 전송합니다.
- 응답이 없으면 재시도하며, 일정 횟수 실패 시 피어가 죽은 것으로 판단합니다.

### 3.2 AWS VPN의 DPD 설정

| 파라미터 | AWS 기본값 | 설명 |
|----------|-----------|------|
| DPD Interval | 10초 | R-U-THERE 전송 간격 |
| DPD Timeout | 30초 | 응답 없을 시 피어 dead 판정까지 대기 시간 |
| DPD Action | `clear` | timeout 시 IKE SA를 삭제하고 터널 종료 |

**AWS의 DPD Action 옵션:**

| Action | 동작 |
|--------|------|
| `clear` | SA 삭제, 터널 종료 (기본값) |
| `restart` | SA 삭제 후 즉시 재협상 시도 |
| `none` | 아무것도 하지 않음 (권장하지 않음) |

### 3.3 clear vs restart: 어떤 것을 써야 하는가?

`clear`와 `restart`의 핵심 차이는 **DPD timeout 후 스스로 재연결을 시도하느냐**입니다.

- **`clear`**: SA를 삭제하고 터널을 종료한 뒤, **상대방이 IKE 재협상을 시작해줄 때까지 대기**합니다. 스스로 재연결하지 않습니다.
- **`restart`**: SA를 삭제하고 **즉시 IKE Phase 1부터 재협상을 시도**합니다. 상대방이 살아있으면 터널이 자동 복구됩니다.

양쪽(AWS, 온프레미스)에서 같은 값을 쓰면 문제가 발생할 수 있습니다:

| 조합 | 문제 |
|------|------|
| 양쪽 모두 `clear` | 둘 다 상대방이 먼저 연결해주길 기다림 → 터널이 복구되지 않음 |
| 양쪽 모두 `restart` | 둘 다 동시에 재협상 시도 → IKE 충돌, 플래핑(flapping) 가능 |

**권장 조합:**

| 위치 | 권장 DPD Action | 이유 |
|------|:---:|------|
| AWS 측 | `clear` (기본값) | SA를 정리하고 깔끔하게 Standby로 Failover |
| 온프레미스 측 | `restart` | 터널 복구를 자동으로 시도하여 빠른 복구 |

AWS 측에서 `clear`를 쓰면, 온프레미스가 죽었을 때 SA를 정리하고 Standby 터널로 Failover합니다. AWS 측에서 `restart`를 쓰면, 죽은 터널을 계속 재연결하려고 시도하면서 Failover와 원래 터널 복구가 동시에 일어나 터널 간 플래핑이 발생할 수 있습니다.

온프레미스 측에서 `restart`를 쓰면, AWS 터널 엔드포인트 교체가 완료된 후 자동으로 재연결을 시도합니다. `clear`를 쓰면 AWS 측이 재연결을 시작해줄 때까지 터널이 DOWN 상태로 남을 수 있습니다.

### 3.5 DPD Timeout과 Failover 시간의 관계

```
Failover 총 시간 = DPD Timeout + 라우팅 수렴 시간
                  = 30초 + α초
```

- DPD Timeout을 줄이면 장애 감지가 빨라지지만, **네트워크 지터(jitter)로 인한 오탐(false positive)** 위험이 증가합니다.
- 일반적으로 DPD Timeout 30초는 합리적인 값이며, 이보다 줄이려면 네트워크 품질이 안정적인지 먼저 확인해야 합니다.

### 3.6 온프레미스 측 DPD 설정 (strongSwan 예시)

```
# /etc/ipsec.conf
conn aws-tunnel1
    dpdaction=restart    # AWS 터널이 죽으면 자동으로 재연결 시도
    dpddelay=10s         # R-U-THERE 전송 간격 (AWS 기본값과 동일)
    dpdtimeout=30s       # 피어 dead 판정까지 대기 시간 (AWS 기본값과 동일)
```

- `dpdaction=restart`: AWS 터널 엔드포인트가 교체되거나 장애가 발생했을 때, 온프레미스가 자동으로 재연결을 시도합니다.
- `dpddelay`와 `dpdtimeout`은 AWS 측 설정과 맞추는 것이 좋습니다. 불일치하면 한쪽이 먼저 dead로 판정해서 비정상 동작이 발생할 수 있습니다.

---

## 4. AWS VPN 터널 엔드포인트 교체 (Endpoint Replacement)

### 4.1 터널 엔드포인트 교체란?

AWS는 패치, 복원력 개선, 하드웨어 폐기, 비정상 터널 감지 등의 이유로 **VPN 터널 엔드포인트를 교체**합니다. 교체 중에는 해당 터널의 연결이 중단됩니다.

> 참고: https://docs.aws.amazon.com/vpn/latest/s2svpn/endpoint-replacements.html

### 4.2 교체의 두 가지 유형

터널 엔드포인트 교체는 **누가 트리거하느냐**에 따라 영향 범위가 다릅니다.

**AWS 관리형 교체 (AWS Managed):**

AWS가 자체적으로 수행하는 업데이트입니다. AWS는 한 번에 한 터널씩 교체하려고 노력하지만, **드물게 양쪽 터널이 동시에 영향을 받을 수 있습니다.**

```
일반적인 경우:
시간축 →
터널1: ████ UP ████ | DOWN (교체) | ████ UP ████
터널2: ████████████████ UP ████████████████████████

드문 경우:
시간축 →
터널1: ████ UP ████ | DOWN (교체) | ████ UP ████
터널2: ████ UP ████ | DOWN (교체) | ████████████
```

**고객 주도 교체 (Customer Initiated):**

사용자가 VPN Connection 설정을 변경할 때 발생합니다. 대부분의 변경은 **양쪽 터널 모두 다운**됩니다.

| 변경 작업 | API | 영향 범위 |
|----------|-----|----------|
| 대상 게이트웨이 변경 | ModifyVpnConnection | **양쪽 터널 모두 다운** |
| Customer Gateway 변경 | ModifyVpnConnection | **양쪽 터널 모두 다운** |
| VPN Connection 옵션 수정 | ModifyVpnConnectionOptions | **양쪽 터널 모두 다운** |
| VPN 터널 옵션 수정 | ModifyVpnTunnelOptions | 해당 터널만 다운 |

### 4.3 교체가 서비스에 미치는 영향

**VGW Active/Standby 환경:**

| 상황 | 영향 |
|------|------|
| Standby 터널 교체 | **영향 없음** - Active 터널이 정상 동작 중 |
| Active 터널 교체 | **Failover 발생** - Standby로 전환되며 10~30초+ 중단 |
| 양쪽 터널 동시 교체 (고객 주도 또는 드문 경우) | **VPN 연결 완전 중단** |

> **실무 포인트**: AWS 관리형 교체는 대부분 한 터널씩 수행되지만, "한 번에 한 터널"은 보장이 아닙니다. 또한 AWS는 어떤 터널을 먼저 교체할지 보장하지 않으므로, Active 터널이 교체 대상이 될 수 있습니다.

**TGW Active/Standby 환경 (Static Routing):**

| 상황 | 영향 |
|------|------|
| Standby 터널 교체 | **영향 없음** - Active 터널이 정상 동작 중 |
| Active 터널 교체 | **Failover 발생** - Standby로 전환되며 10~30초+ 중단 |
| 양쪽 터널 동시 교체 (고객 주도 또는 드문 경우) | **VPN 연결 완전 중단** |

VGW Active/Standby와 동일한 영향입니다. TGW를 쓴다고 Failover가 빨라지지는 않습니다. ECMP를 쓰려면 BGP가 필요합니다.

**TGW Active/Active 환경 (ECMP + BGP):**

| 상황 | 영향 |
|------|------|
| 터널 하나 교체 | **최소 영향** - 나머지 터널이 즉시 전체 트래픽 처리. 대역폭 절반 감소 |
| 양쪽 터널 동시 교체 (고객 주도 또는 드문 경우) | **VPN 연결 완전 중단** |

### 4.4 유지보수 알림

- AWS Personal Health Dashboard (PHD)에서 유지보수 일정을 사전 알림합니다.
- AWS Health API를 통해 프로그래밍 방식으로 알림을 받을 수 있습니다.
- 유지보수 알림을 받으면 온프레미스 측에도 공유하여, 양측이 유지보수 시간대를 인지하도록 해야 합니다.

### 4.5 대비 권장 사항

1. **양쪽 터널 모두 반드시 UP 상태를 유지합니다.** 터널 하나만 사용하고 있으면 교체 시 완전한 중단이 발생합니다.
2. **VGW 환경에서도 Standby 터널이 정상인지 주기적으로 확인합니다.** Standby 터널이 이미 DOWN인 상태에서 Active 터널 교체가 시작되면 전체 VPN 연결이 끊어집니다.
3. **VPN Connection 설정 변경은 점검 시간에 수행합니다.** 고객 주도 변경은 양쪽 터널이 동시에 다운되므로, 서비스 영향을 최소화할 수 있는 시간대에 작업해야 합니다.
4. **유지보수 알림을 Slack 등으로 전달하는 파이프라인을 구축합니다.** (아래 모니터링 섹션 참고)

---

## 5. 모니터링 및 알림 (Observability)

### 5.1 CloudWatch 메트릭

AWS Site-to-Site VPN은 다음 CloudWatch 메트릭을 제공합니다:

| 메트릭 | 설명 | 활용 |
|--------|------|------|
| `TunnelState` | 터널 UP(1) / DOWN(0) 상태 | **가장 중요한 메트릭.** Alarm 설정 필수 |
| `TunnelDataIn` | 터널로 수신된 바이트 수 | 트래픽 패턴 분석 |
| `TunnelDataOut` | 터널에서 송신된 바이트 수 | 트래픽 패턴 분석 |

- **Dimension**: `VpnId` (VPN Connection ID) + `TunnelIpAddress` (터널 엔드포인트 IP)
- 터널별로 개별 모니터링이 가능합니다.

### 5.2 VPN 로그

AWS VPN은 두 가지 로그를 제공합니다:

**Connection Log (연결 로그):**
- IKE 협상 과정, SA 수립/삭제, DPD 이벤트 등을 기록
- 트러블슈팅 시 가장 유용한 로그
- CloudWatch Logs에 저장 가능

**Status Log (상태 로그):**
- 터널 상태 변경 이벤트를 기록
- UP/DOWN 전환 시점과 원인 파악에 활용

로그 활성화는 VPN Connection 생성 시 또는 이후에 설정할 수 있습니다:
- 참고: https://docs.aws.amazon.com/vpn/latest/s2svpn/enable-logs.html

### 5.3 알림 파이프라인: CloudWatch Alarm -> SNS -> Slack

터널 DOWN 상태를 즉시 인지하기 위한 알림 흐름을 구성합니다.

```
CloudWatch Metric (TunnelState)
        |
        v
CloudWatch Alarm (TunnelState < 1 for 1 minute)
        |
        v
SNS Topic
        |
        v
AWS Lambda (또는 AWS Chatbot)
        |
        v
Slack Channel (#vpn-alerts)
```

#### CloudWatch Alarm 설정 예시

각 터널에 대해 개별 Alarm을 설정합니다:

| 설정 항목 | 값 |
|-----------|-----|
| Metric | `TunnelState` |
| Statistic | `Maximum` |
| Period | `60초` (1분) |
| Threshold | `< 1` (즉, DOWN 상태) |
| Datapoints to alarm | `1 out of 1` |
| Actions | SNS Topic으로 알림 발송 |

**Alarm 설정 시 주의사항:**
- 터널 2개에 대해 **각각 별도의 Alarm**을 만들어야 합니다.
- "두 터널 모두 DOWN" 상태를 감지하는 **Composite Alarm**도 추가로 생성하는 것을 권장합니다. 이 Alarm이 발생하면 VPN 연결이 완전히 끊어진 것이므로 즉시 대응이 필요합니다.

#### AWS Chatbot을 이용한 Slack 연동

Lambda를 직접 개발하는 대신 **AWS Chatbot**을 활용하면 코드 없이 Slack 연동이 가능합니다:

1. AWS Chatbot 콘솔에서 Slack workspace 연동
2. Chatbot Channel Configuration 생성 (Slack 채널 지정)
3. SNS Topic을 Chatbot에 연결
4. CloudWatch Alarm -> SNS -> Chatbot -> Slack 자동 알림

### 5.4 모니터링 대시보드 구성

CloudWatch Dashboard에 다음 위젯을 추가하여 VPN 상태를 한눈에 파악합니다:

1. **TunnelState** - 터널별 UP/DOWN 상태 (숫자 위젯)
2. **TunnelDataIn / TunnelDataOut** - 트래픽 추이 (그래프 위젯)
3. **Alarm 상태** - 현재 활성화된 Alarm 목록

---

## 6. 실무 HA 운영 체크리스트

### 6.1 구축 단계

- [ ] 두 터널 모두 UP 상태인지 확인
- [ ] DPD 설정이 양측(AWS, 온프레미스)에서 일치하는지 확인
- [ ] BGP 사용 시: BGP hold timer 설정 확인 (기본 90초, 필요 시 축소 검토)
- [ ] VPN Connection Log 활성화
- [ ] CloudWatch Alarm 설정 (터널별 + Composite)
- [ ] Slack 알림 연동 테스트

### 6.2 운영 단계

- [ ] 월 1회 Failover 테스트 수행 (온프레미스 측 터널 하나를 의도적으로 다운시키고 복구 시간 측정)
- [ ] AWS Personal Health Dashboard 유지보수 알림 확인
- [ ] CloudWatch 대시보드로 터널 상태 및 트래픽 추이 모니터링
- [ ] 온프레미스 VPN 장비 로그 정기 점검

### 6.3 장애 대응

| 상황 | 확인 사항 | 조치 |
|------|----------|------|
| 터널 1개 DOWN | CloudWatch Alarm 확인, VPN Connection Log 확인 | 원인 파악 후 온프레미스/AWS 측 조치. 나머지 터널로 서비스 유지 중인지 확인 |
| 터널 2개 모두 DOWN | Composite Alarm 확인 | 즉시 대응. 온프레미스 장비 상태 확인, AWS 콘솔에서 VPN Connection 상태 확인 |
| AWS 유지보수 알림 수신 | PHD에서 유지보수 일정 확인 | 온프레미스 팀에 공유, 양쪽 터널 UP 상태 확인, 유지보수 시간대 모니터링 강화 |
| Failover 후 복구 지연 | DPD 설정, BGP timer, IKE 재협상 로그 확인 | DPD action이 `restart`인지 확인, 온프레미스 측 IKE 설정 점검 |

---

## 7. HA 아키텍처 선택 기준

### VGW Active/Standby를 선택하는 경우

- 단일 VPC만 VPN으로 연결하는 경우
- 보안 격리가 필요 없는 경우 (같은 회사 지사 간 연결 등)
- 비용을 최소화해야 하는 경우 (VGW 자체는 무료)
- 10~30초 수준의 Failover 중단이 허용되는 서비스

### TGW Active/Standby를 선택하는 경우

- 여러 외부 회사와 VPN을 연결하면서 보안 격리가 필요한 경우
- 온프레미스에서 BGP를 지원하지 않는 경우
- 10~30초 수준의 Failover 중단이 허용되는 서비스
- HA는 VGW와 동일하지만, 보안(회사별 Route Table 격리)이 필요할 때 선택

### TGW Active/Active (ECMP)를 선택하는 경우

- Failover 중단 시간을 최소화해야 하는 경우 (거의 0초)
- 대역폭을 최대화해야 하는 경우 (터널 2개 동시 사용)
- 온프레미스에서 **BGP를 지원하는 경우** (ECMP는 BGP 필수)
- 보안 격리 + 고가용성 모두 필요한 환경
- 향후 Direct Connect 등 추가 연결을 고려하는 경우

---

## 8. 파트너사와의 기술 미팅 시 확인 사항

VPN HA에 대해 파트너사 인프라팀과 논의할 때 확인해야 할 질문 목록입니다:

1. **온프레미스 VPN 장비 HA 구성**: Active/Standby인지, Active/Active인지, VIP를 사용하는지
2. **IPSec SA 동기화 여부**: Standby 장비로 전환 시 IPSec SA를 재협상하는지, HA sync로 넘기는지
3. **DPD 설정**: DPD interval, timeout, action 값
4. **BGP 설정** (해당 시): BGP ASN, hold timer, keepalive interval
5. **Failover 테스트 결과**: 실제 측정한 Failover 시간 (주장이 아닌 데이터)
6. **유지보수 알림 공유 체계**: AWS 유지보수 시 온프레미스 팀에 알리는 프로세스

> **팁**: 파트너사가 "장애 없다"고 주장할 때, "IPSec SA 재협상 없이 전환되는 것이 맞나요?"라고 물어보면 HA sync 구성 여부를 확인할 수 있습니다. SA 재협상이 필요하다면 최소 10~20초의 중단은 불가피합니다.

---

## 참고자료

* [AWS Site-to-Site VPN - Monitoring VPN Logs](https://docs.aws.amazon.com/vpn/latest/s2svpn/monitoring-logs.html)
* [AWS Site-to-Site VPN - Status Logs](https://docs.aws.amazon.com/vpn/latest/s2svpn/status-logs.html)
* [AWS Site-to-Site VPN - Enable Logs](https://docs.aws.amazon.com/vpn/latest/s2svpn/enable-logs.html)
* [AWS Site-to-Site VPN - Tunnel Options](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPNTunnels.html)
* [AWS VPN Concentrator](https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-concentrator.html)
