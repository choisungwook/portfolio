# 비용

Network Firewall 비용은 처리량보다 endpoint를 켜 둔 시간이 대부분입니다. endpoint는 AZ마다 하나씩 생기고 트래픽이 없어도 시간 요금이 나가므로, AZ 수와 켜 두는 시간이 비용을 정합니다. 아래 가격은 2026-11-01에 AWS Price List API로 조회한 ap-northeast-2(서울) on-demand 가격입니다.

## 단가

| 항목 | 단가 | 이 실습에서 |
| --- | --- | --- |
| Firewall endpoint | $0.395 / 시간 | AZ a, c 2개 |
| Firewall 처리 데이터 | $0.065 / GB | probe 트래픽뿐이라 무시할 수준 |
| Advanced inspection(TLS inspection) endpoint | $0.792 / 시간 | 쓰지 않음 |
| Active Threat Defense 처리 데이터 | $0.065 / GB에 추가로 $0.005 / GB | 쓰지 않음. 콘솔 기본값이 켜짐이라 policy 생성 시 해제 |
| Secondary endpoint(다른 VPC에 같은 firewall을 연결) | $0.158 / 시간 | 쓰지 않음 |
| NAT gateway | $0.059 / 시간, $0.059 / GB | 1개 |
| EC2 t4g.medium | $0.0416 / 시간 | 2대 |
| Public IPv4(NAT의 Elastic IP) | $0.005 / 시간 | 1개 |
| EBS gp3 | $0.0912 / GB-월 | 30GB × 2 |
| CloudWatch Logs 수집(vended log, Standard) | $0.76 / GB(처음 10TB) | alert, flow 로그. 실습 분량은 무시할 수준 |
| Firewall monitoring dashboard | 무료. 대시보드가 실행하는 Logs Insights 쿼리 요금만 발생 | 화면 갱신 몇 번 수준이라 무시할 수준 |

## NAT gateway 요금은 firewall endpoint만큼 면제된다

firewall endpoint와 같은 경로에 있는 NAT gateway는 endpoint 1시간마다 NAT 1시간, endpoint가 처리한 1GB마다 NAT 1GB 요금이 면제됩니다. 이 실습은 endpoint 2개가 켜져 있는 동안 NAT 1개의 시간 요금이 전부 면제됩니다. firewall을 NAT 앞에 두든 뒤에 두든 같은 경로이면 면제 대상입니다.

## 실습 비용 산정

| 구간 | 시간당 | 내역 |
| --- | --- | --- |
| Terraform만 켠 상태 | 약 $0.155 | NAT $0.059 + EC2 $0.0832 + IPv4 $0.005 + EBS 약 $0.0075 |
| firewall을 켠 상태 | 약 $0.886 | endpoint $0.79 + EC2 $0.0832 + IPv4 $0.005 + EBS 약 $0.0075, NAT 시간 요금 면제 |

시나리오 2~4를 이어서 하면 firewall은 약 1시간 켜져 있고, firewall 생성 5분과 삭제 4분도 endpoint 시간에 들어갑니다. 실습 전체는 $1~2 수준입니다. firewall을 지우지 않고 하루 두면 약 $21이 나가므로, 끝나면 [setup.md의 Down](./setup.md#down)으로 바로 지웁니다.

## 운영 환경의 비용 결정 요인

AZ 3개에 한 달(730시간) 켜 두면 endpoint만 $865입니다. 여기에 처리량 1TB마다 $65가 더해지고, 같은 경로의 NAT 요금은 그만큼 줄어듭니다.

- VPC마다 firewall을 따로 두면 VPC 수만큼 endpoint 요금이 곱해집니다. VPC가 많으면 Transit Gateway 뒤의 inspection VPC 하나로 모으거나 secondary endpoint($0.158 / 시간)로 firewall 하나를 여러 VPC에 연결하는 구성을 비교합니다. VPC 수와 트래픽에 따른 손익분기는 [architecture-decision.md](./architecture-decision.md#vpc-수에-따른-비용-손익분기)에 있습니다.
- TLS inspection은 endpoint 단가가 두 배($0.792)입니다. SNI로 충분한 도메인 허용 목록에는 켜지 않습니다.
- flow 로그는 모든 흐름을 남기므로 alert 로그보다 훨씬 큽니다. 운영에서는 CloudWatch Logs 대신 S3로 보내거나 보존 기간을 짧게 둡니다.

## 참고 문서

1. AWS Network Firewall pricing, <https://aws.amazon.com/network-firewall/pricing/>
2. Amazon VPC pricing(NAT gateway), <https://aws.amazon.com/vpc/pricing/>
