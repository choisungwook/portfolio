# 비용 (Cost & Pricing)

## 비용 구조 개요

AWS Network Firewall의 비용은 데이터 처리량보다는 **방화벽 엔드포인트(Firewall Endpoint)를 프로비저닝하여 켜둔 시간 요금**이 대부분을 차지합니다. 엔드포인트는 가용 영역(AZ)마다 1개씩 생성되며 실제 트래픽이 흐르지 않더라도 시간당 고정 요금이 부과되므로, **가용 영역의 개수**와 **리소스 구동 시간**이 전체 비용을 결정하는 핵심 변수입니다.

아래 요금은 서울 리전(ap-northeast-2) 온디맨드(On-demand) 기준 단가입니다.

---

## 리소스별 세부 단가표

| 리소스 구분 | 단위 단가 | 본 실습 환경 구성 | 비용 발생 특이사항 |
| --- | --- | --- | --- |
| **Firewall Endpoint** | \$0.395 / 시간 (AZ당) | AZ a, AZ c 총 2개 (\$0.79/hr) | 방화벽 생성 시점부터 삭제 시점까지 지속 과금 |
| **Firewall 트래픽 처리비** | \$0.065 / GB | 실습 프로브 트래픽 수준 (수 MB) | 본 핸즈온 분량에서는 비용 영향 미미 |
| **NAT Gateway** | \$0.059 / 시간, \$0.059 / GB | 단일 NAT Gateway (AZ a) 1개 | **방화벽 엔드포인트 시간만큼 면제 적용** (하단 설명 참고) |
| **EC2 인스턴스 (t4g.medium)** | \$0.0416 / 시간 | AZ당 1대씩 총 2대 (\$0.0832/hr) | 워크로드 시뮬레이션용 |
| **Public IPv4 주소** | \$0.005 / 시간 | NAT Gateway용 Elastic IP 1개 | AWS 공용 IPv4 과금 정책 반영 |
| **EBS 볼륨 (gp3)** | \$0.0912 / GB-월 | 30 GB × 2대 | 실습 시간(1~2시간) 환산 시 약 \$0.01 내외 |
| **CloudWatch Logs** | \$0.76 / GB (인입량) | Alert 및 Flow 로그 그룹 | 실습 분량에서는 비용 영향 미미 |
| **Firewall 내장 모니터링 탭** | 무료 (쿼리비 별도) | 콘솔 대시보드 활성화 | 대시보드 새로고침 시 실행되는 Logs Insights 쿼리 비용만 발생 |

---

## NAT Gateway 요금 면제 혜택 (비용 상쇄)

AWS는 Network Firewall과 동일한 트래픽 경로상에 위치한 NAT Gateway에 대해 요금 면제 혜택을 제공합니다.

- **시간 요금 면제**: Firewall Endpoint가 가동 중인 1시간당 동일 경로의 NAT Gateway 1시간 요금이 자동 면제됩니다.
- **데이터 처리 요금 면제**: Firewall Endpoint가 처리한 1GB당 NAT Gateway의 데이터 처리 요금 1GB가 면제됩니다.

본 실습 환경은 Firewall Endpoint 2개를 구동하므로, 실습이 진행되는 동안 단일 NAT Gateway의 시간당 비용(\$0.059/hr)은 전액 면제 처리됩니다. (방화벽을 NAT Gateway 앞이나 뒤 어느 쪽에 배치하더라도 동일 경로이면 면제 적용)

---

## 실습 비용 산정

실습 단계에 따른 예상 시간당 비용은 아래와 같습니다.

| 실습 진행 단계 | 시간당 예상 비용 | 구성 상세 내역 |
| --- | :---: | --- |
| **Terraform 기본 인프라 구동 상태** | **약 \$0.155 / 시간** | NAT Gateway (\$0.059) + EC2 2대 (\$0.0832) + IPv4 EIP (\$0.005) + EBS |
| **Firewall 엔드포인트 활성화 상태** | **약 \$0.886 / 시간** | 방화벽 엔드포인트 2개 (\$0.79) + EC2 2대 (\$0.0832) + IPv4 (\$0.005) + EBS (NAT Gateway 시간 요금 전액 면제 반영) |

- 시나리오 2부터 4까지 순차적으로 실습을 완료하는 데 통상 약 1~2시간이 소요됩니다.
- 따라서 **전체 실습에 발생하는 총비용은 약 \$1 ~ \$2 내외**입니다.
- **주의**: 실습이 끝난 후 방화벽을 삭제하지 않고 방치할 경우 하루 약 \$21 이상의 요금이 발생하므로, 실습을 마친 후 반드시 [setup.md의 Down](./setup.md#down) 가이드에 따라 리소스를 즉시 정리하십시오.

---

## 실제 운영 환경에서의 비용 최적화 전략

가용 영역 3개(3 AZ)를 사용하는 프로덕션 환경에 방화벽을 상시 운영할 경우, 엔드포인트 고정비만 월 약 \$865(730시간 기준)가 발생합니다. 여기에 트래픽 1TB당 \$65의 처리 요금이 가산됩니다.

1. **다중 VPC 환경 비용 최적화**:
   - 관리하는 VPC가 늘어날수록 VPC마다 방화벽을 개별 배치하면 엔드포인트 비용이 배수로 증가합니다.
   - VPC가 3개 이상인 조직에서는 Transit Gateway 기반의 중앙 집중형 아키텍처나 Secondary Endpoint(\$0.158/hr) 공유 모델을 적용하여 고정비를 대폭 절감할 수 있습니다. (자세한 비교는 [architecture-decision.md](./architecture-decision.md#vpc-수에-따른-비용-손익분기) 참고)
2. **TLS Inspection 옵션 신중 도입**:
   - TLS 복호화 검사(Advanced Inspection) 옵션을 켜면 엔드포인트 단가가 시간당 \$0.792로 2배 상승합니다. 본 핸즈온처럼 TLS SNI 기반의 도메인 제어만 필요하다면 TLS Inspection을 비활성화하여 비용을 절감합니다.
3. **대용량 Flow 로그 저장소 분리**:
   - 모든 네트워크 트래픽을 남기는 Flow 로그를 CloudWatch Logs로 장기 보존하면 수집 및 저장 비용이 크게 증가할 수 있습니다. Alert 로그만 CloudWatch Logs로 실시간 모니터링하고, Flow 로그는 Amazon S3 버킷으로 수집하도록 분리 구성하는 것이 경제적입니다.

---

## 참고 문서

1. [AWS Network Firewall pricing](https://aws.amazon.com/network-firewall/pricing/)
2. [Amazon VPC pricing (NAT gateway)](https://aws.amazon.com/vpc/pricing/)
