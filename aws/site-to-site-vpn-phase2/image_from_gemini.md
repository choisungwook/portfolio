# Gemini 아키텍처 다이어그램 프롬프트

blog-post.md에 삽입할 아키텍처 다이어그램을 Gemini에게 요청하기 위한 프롬프트입니다.
AWS icon pack을 NotebookLM 지식베이스로 사용하는 환경 기준입니다.

---

## 다이어그램 1: VGW의 구조적 한계

> 블로그 삽입 위치: `### VGW의 구조적 한계`

```
AWS 아키텍처 다이어그램을 그려줘. AWS icon pack을 사용해.

제목: "VGW는 온프레미스→AWS 트래픽을 필터링할 수 없다"

구성요소:
- 왼쪽: 온프레미스 영역 (건물 아이콘 또는 Corporate Data Center)
  - VPN 장비 (Server 아이콘), IP: 10.20.0.0/16
- 가운데: VPN 터널 2개 (점선으로 표현, IPSec 터널)
- 오른쪽: AWS Cloud 영역
  - VGW (Virtual Private Gateway 아이콘)
  - VPC (10.10.0.0/16)
    - Private Subnet에 EC2, RDS, NLB 등 여러 리소스가 있음

트래픽 흐름:
- 온프레미스 → VPN 터널 → VGW → VPC 내 모든 리소스에 접근 가능 (빨간색 화살표)
- VGW 옆에 "X" 표시와 함께 "내부 라우팅 테이블 없음 → 패킷 필터링 불가" 텍스트

핵심 메시지: VGW는 단순한 게이트웨이일 뿐, 온프레미스에서 오는 트래픽을 제어하지 못하고 VPC 전체에 그대로 전달한다는 것을 시각적으로 보여줘.
```

---

## 다이어그램 2: CloudHub 리스크 (BGP 재광고)

> 블로그 삽입 위치: `### CloudHub 리스크`

```
AWS 아키텍처 다이어그램을 그려줘. AWS icon pack을 사용해.

제목: "VGW + BGP에서 CloudHub 재광고 리스크"

구성요소:
- 왼쪽 위: A사 온프레미스 (10.1.0.0/16, BGP ASN 65001)
  - Customer Gateway 아이콘
- 왼쪽 아래: B사 온프레미스 (10.2.0.0/16, BGP ASN 65002)
  - Customer Gateway 아이콘
- 오른쪽: AWS Cloud 영역
  - VGW (Virtual Private Gateway)
  - VPC (10.10.0.0/16)

트래픽 흐름 (빨간색, 위험 표시):
- VGW → A사 방향: "B사 경로 10.2.0.0/16 광고" (빨간 점선 화살표)
- VGW → B사 방향: "A사 경로 10.1.0.0/16 광고" (빨간 점선 화살표)
- A사 ↔ B사 사이에 "서로 관계없는 회사끼리 통신 경로가 열림!" 경고 텍스트

핵심 메시지: VGW가 BGP 경로를 재광고하여, 서로 이해관계 없는 회사 간 통신이 가능해지는 보안 리스크를 시각적으로 보여줘. 위험을 강조하기 위해 빨간색 계열을 사용해.
```

---

## 다이어그램 3: TGW 보안 격리 아키텍처 (권장 방식)

> 블로그 삽입 위치: `### TGW를 사용한 보안 격리 (권장 방식)`
> 이 다이어그램이 가장 중요합니다.

```
AWS 아키텍처 다이어그램을 그려줘. AWS icon pack을 사용해. 이 다이어그램이 가장 중요해.

제목: "TGW 회사별 전용 Route Table로 보안 격리"

구성요소:
- 왼쪽: 3개 회사의 온프레미스
  - A사 (BGP, 10.1.0.0/16) - Customer Gateway
  - B사 (Static, 10.2.0.0/16) - Customer Gateway
  - C사 (BGP, 10.3.0.0/16) - Customer Gateway
- 가운데: AWS Cloud 영역
  - Transit Gateway (TGW) 아이콘 - 중앙 허브
  - TGW 안에 3개의 Route Table을 시각적으로 분리해서 표현:
    - "A사 전용 RT": 10.10.1.50/32 → VPC (NLB IP만 허용)
    - "B사 전용 RT": 10.10.1.50/32 → VPC (NLB IP만 허용)
    - "C사 전용 RT": 10.10.1.50/32 → VPC (NLB IP만 허용)
  - 각 Route Table 옆에 "그 외 → Blackhole (패킷 드롭)" 텍스트
- 오른쪽: VPC (10.10.0.0/16)
  - NLB (10.10.1.50)
  - Private Subnet에 Backend 서비스

연결:
- A사 → VPN → TGW VPN Attachment → A사 전용 RT → VPC Attachment → VPC
- B사 → VPN → TGW VPN Attachment → B사 전용 RT → VPC Attachment → VPC
- C사 → VPN → TGW VPN Attachment → C사 전용 RT → VPC Attachment → VPC
- A사에서 B사로 가는 경로에 "X" 표시: "A사 RT에 B사 경로 없음 → Blackhole"

핵심 메시지: 각 회사의 Route Table이 완전히 분리되어 있어서, A사가 B사 IP로 패킷을 보내도 경로가 없어 Blackhole(패킷 드롭)된다는 것을 보여줘. Route Table 분리가 핵심이므로 시각적으로 강조해.
```

---

## 다이어그램 4: Defense-in-Depth (다층 방어)

> 블로그 삽입 위치: `### Defense-in-Depth (다층 방어)`

```
AWS 아키텍처 다이어그램을 그려줘. AWS icon pack을 사용해.

제목: "Defense-in-Depth: 4개 Layer 다층 방어"

구성요소를 동심원(양파 껍질) 또는 중첩 박스 형태로 표현해:

가장 바깥 (Layer 1): TGW Route Table
- 색상: 파란색 계열
- 설명: "게이트웨이 레벨 - 허용된 /32 목적지만 통과"
- 아이콘: Transit Gateway

두 번째 (Layer 2): Security Group
- 색상: 초록색 계열
- 설명: "인스턴스 레벨 - 허용된 Source IP + Port만 통과"
- 아이콘: Security Group 자물쇠

세 번째 (Layer 3): Network ACL
- 색상: 주황색 계열
- 설명: "서브넷 레벨 - Stateless 추가 필터링"
- 아이콘: Network ACL

가장 안쪽 (Layer 4): Logging & Monitoring
- 색상: 보라색 계열
- 설명: "CloudWatch Logs + VPC Flow Logs + Alarm"
- 아이콘: CloudWatch

가운데 핵심: NLB + Backend 서비스 (보호 대상)

핵심 메시지: 단일 방어선이 아니라 4개 Layer가 겹겹이 보호한다는 것을 시각적으로 보여줘.
```

---

## 다이어그램 5: Active/Active vs Active/Standby 비교

> 블로그 삽입 위치: `### Active/Active vs Active/Standby 고가용성 아키텍처`

```
AWS 아키텍처 다이어그램을 그려줘. AWS icon pack을 사용해.

제목: "Active/Active (ECMP) vs Active/Standby 비교"

두 개의 아키텍처를 위아래 또는 좌우로 나란히 배치해.

[위쪽 또는 왼쪽] Active/Active (TGW + BGP + ECMP):
- 온프레미스: VPN 장비 (strongSwan + FRR)
- VPN 터널 2개: 둘 다 녹색(Active) 굵은 실선, 양쪽에 트래픽 화살표
  - 터널1: "Active (BGP)" 라벨, 녹색
  - 터널2: "Active (BGP)" 라벨, 녹색
- AWS: Transit Gateway (ECMP 활성화)
  - "ECMP: 트래픽 분산" 라벨
- 장애 시: "한 터널 다운 → 나머지 터널이 즉시 처리 (거의 0초)" 텍스트
- VPC

[아래쪽 또는 오른쪽] Active/Standby (VGW + Static):
- 온프레미스: VPN 장비 (strongSwan만)
- VPN 터널 2개:
  - 터널1: "Active" 라벨, 녹색 굵은 실선, 트래픽 화살표
  - 터널2: "Standby" 라벨, 회색 점선, 트래픽 없음
- AWS: VGW (Virtual Private Gateway)
- 장애 시: "Active 다운 → DPD 감지 → Standby 전환 (10~30초+)" 텍스트
- VPC

핵심 메시지: Active/Active는 두 터널을 동시에 사용하여 Failover가 즉시이고, Active/Standby는 한 터널만 사용하여 전환에 10~30초가 걸린다는 차이를 시각적으로 보여줘.
```

---

## 다이어그램 6: VPN 모니터링 및 알림 파이프라인

> 블로그 삽입 위치: `### AWS VPN 모니터링 및 알람 설정`

```
AWS 아키텍처 다이어그램을 그려줘. AWS icon pack을 사용해.

제목: "AWS VPN 모니터링 및 Slack 알림 파이프라인"

왼쪽에서 오른쪽으로 흐르는 파이프라인 형태:

1단계: VPN 터널 (Site-to-Site VPN 아이콘)
  - 터널1, 터널2 표시

2단계: CloudWatch (CloudWatch 아이콘)
  - "TunnelState 메트릭 (UP=1, DOWN=0)" 라벨

3단계: CloudWatch Alarm (Alarm 아이콘)
  - 개별 Alarm 2개: "터널1 Alarm", "터널2 Alarm"
  - Composite Alarm 1개: "두 터널 모두 DOWN" (빨간색 강조)
  - "TunnelState < 1 for 1분" 라벨

4단계: SNS Topic (SNS 아이콘)

5단계 (분기):
  - 경로1: AWS Chatbot → Slack (#vpn-alerts)
  - 경로2: Lambda (선택) → Slack (#vpn-alerts)

별도 흐름 (아래쪽에 추가):
  - AWS Health (Personal Health Dashboard) → EventBridge → SNS → Slack (#vpn-maintenance)

핵심 메시지: 터널 상태를 자동으로 감지하고 Slack으로 즉시 알림하는 파이프라인 전체 구조를 보여줘. Composite Alarm이 "VPN 완전 중단"을 감지한다는 점을 빨간색으로 강조해.
```

---

## 블로그 삽입 위치 요약

| 번호 | 다이어그램 | 블로그 섹션 |
|:---:|-----------|-----------|
| 1 | VGW 구조적 한계 | `### VGW의 구조적 한계` |
| 2 | CloudHub 리스크 | `### CloudHub 리스크` |
| 3 | TGW 격리 아키텍처 | `### TGW를 사용한 보안 격리` |
| 4 | Defense-in-Depth | `### Defense-in-Depth (다층 방어)` |
| 5 | Active/Active vs Active/Standby | `### Active/Active vs Active/Standby` |
| 6 | 모니터링 파이프라인 | `### AWS VPN 모니터링 및 알람 설정` |
