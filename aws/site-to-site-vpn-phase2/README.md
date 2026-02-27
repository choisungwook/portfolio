# AWS Site to Site VPN 핸즈온 (TGW 기반)

이 예제는 AWS Site to Site VPN을 실습합니다. 이론 설명은 저의 블로그에 있습니다.

- 블로그 링크: https://malwareanalysis.tistory.com/893

## 시나리오

- [Active-Active VPN](./active-active-vpn.md)
- [AI가 작성한 Active-Standby VPN](./active-standby-vpn.md)
- [AI가 작성한 보안관점 VPN 문서](./security.md)
- [AI가 작성한 운영관점 VPN 문서](./highavailability.md)
- [AI가 작성한 VPN 프로토콜](./vpn-protocol.md)

## TGW Flow Logs

TGW flow log는 Transit Gateway를 통과하는 네트워크 트래픽을 기록합니다. VPN 터널을 통해 온프레미스와 AWS 간 통신이 정상적으로 이루어지는지 확인하거나, 보안 이슈를 분석할 때 사용합니다.

### 리소스 구성

| 리소스 | 설명 |
|--------|------|
| `aws_ec2_transit_gateway` | TGW 생성 |
| `aws_ec2_transit_gateway_vpc_attachment` | Cloud VPC를 TGW에 연결 |
| `aws_cloudwatch_log_group` | Flow log 저장소 (보관기간: 7일) |
| `aws_iam_role` + `aws_iam_role_policy` | Flow log 전송 권한 |
| `aws_flow_log` | TGW flow log 활성화 (ALL 트래픽, 60초 집계) |

### Flow Log 조회 방법

CloudWatch Logs Insights에서 아래 쿼리로 조회할 수 있습니다.

```
fields @timestamp, srcAddr, dstAddr, srcPort, dstPort, protocol, packets, bytes, action
| filter action = "REJECT"
| sort @timestamp desc
| limit 50
```

### Flow Log 레코드 예시

```
version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status
2 123456789012 tgw-attach-0abcdef1234567890 10.20.1.100 10.10.1.50 52000 80 6 10 5200 1704067200 1704067260 ACCEPT OK
2 123456789012 tgw-attach-0abcdef1234567890 10.10.1.50 10.20.1.100 80 52000 6 8 4500 1704067200 1704067260 ACCEPT OK
2 123456789012 tgw-attach-0abcdef1234567890 10.20.1.100 10.10.1.50 0 0 1 4 280 1704067200 1704067260 ACCEPT OK
2 123456789012 tgw-attach-0abcdef1234567890 192.168.1.100 10.10.1.50 44312 443 6 5 320 1704067200 1704067260 REJECT OK
```

#### 필드 설명

| 필드 | 설명 | 예시 값 |
|------|------|---------|
| `version` | Flow log 버전 | `2` |
| `account-id` | AWS 계정 ID | `123456789012` |
| `interface-id` | TGW attachment ID | `tgw-attach-0abcdef...` |
| `srcaddr` | 출발지 IP | `10.20.1.100` (온프레미스) |
| `dstaddr` | 목적지 IP | `10.10.1.50` (AWS Cloud) |
| `srcport` | 출발지 포트 | `52000` |
| `dstport` | 목적지 포트 | `80` (HTTP) |
| `protocol` | 프로토콜 번호 | `6`(TCP), `17`(UDP), `1`(ICMP) |
| `packets` | 패킷 수 | `10` |
| `bytes` | 바이트 수 | `5200` |
| `start` | 집계 시작 시간 (Unix) | `1704067200` |
| `end` | 집계 종료 시간 (Unix) | `1704067260` |
| `action` | 허용/거부 | `ACCEPT` 또는 `REJECT` |
| `log-status` | 로그 상태 | `OK`, `NODATA`, `SKIPDATA` |

#### 위 예시 해석

1. **HTTP 요청 (ACCEPT)**: 온프레미스(`10.20.1.100:52000`) -> AWS Cloud nginx(`10.10.1.50:80`) TCP 통신 허용
2. **HTTP 응답 (ACCEPT)**: AWS Cloud nginx(`10.10.1.50:80`) -> 온프레미스(`10.20.1.100:52000`) 응답 트래픽 허용
3. **ICMP ping (ACCEPT)**: 온프레미스(`10.20.1.100`) -> AWS Cloud(`10.10.1.50`) ping 허용
4. **비인가 접근 (REJECT)**: 외부(`192.168.1.100:44312`) -> AWS Cloud(`10.10.1.50:443`) HTTPS 접근 거부
