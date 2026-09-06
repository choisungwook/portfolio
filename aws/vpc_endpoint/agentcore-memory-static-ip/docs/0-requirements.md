# 요구사항과 시나리오 분류

- 목적: outbound 목적지 IP가 제한된 클라이언트에서 AWS 인증 후 AgentCore Memory 단기 이벤트 저장·조회.
- 리전: `ap-northeast-2`. IAM Role은 글로벌 리소스이고, STS·Memory API는 서울 endpoint 사용.
- 연결은 인터넷이고 고정 목적지는 public NLB의 EIP예요. VPN 경로는 이번 범위에서 제외했어요.
- 가능 판정은 명시한 조건에서의 설계 판정이에요. 실제 AWS 성공 여부는 [검증 상태](4-validation.md)와 구분해요.

## 먼저 구분할 조건

| 축 | 구분 | 의미 |
| --- | --- | --- |
| DNS 변경 | 가능 / 불가 | AWS 도메인의 응답을 NLB EIP로 바꿀 수 있는지 |
| 프록시 | 설정 가능 / 불가 | boto3에서 HTTPS CONNECT를 쓸 수 있는지. 프록시는 앱 네트워크 안에 둠 |
| 인증 | STS | 기존 IAM 액세스 키로 AssumeRole. Roles Anywhere는 [별도 실습](../../../iam/roles-anywhere/README.md) |

- DNS 변경 불가는 클라이언트의 hosts·resolver·AWS 도메인 응답을 수정할 수 없다는 뜻이에요.
- 자체 도메인의 public Route 53 레코드를 추가하는 것은 클라이언트 DNS 변경과 다른 작업이에요. `amazonaws.com` 응답은 public hosted zone으로 바꿀 수 없어요.

## 가능 여부

| 시나리오 | 경로 | DNS 변경 | 인증 / 추가 설정 | 판정 |
| --- | --- | --- | --- | --- |
| [S01](scenarios/s01/2-experiment.md) | 인터넷 → public TCP NLB → VPCE | 필요 | 로컬 AWS 프로파일 주체 → STS AssumeRole | 조건부 가능 |
| [S02](scenarios/s02/2-experiment.md) | 앱 네트워크 Squid(CONNECT) → public TCP NLB → VPCE | 불필요 (프록시 호스트가 해석) | AWS 클라이언트 프록시 설정, STS | 가능. DNS 변경 불가 시 권장 |
| [S05](scenarios/s05/2-experiment.md) | 자체 도메인 Route 53 → public TCP NLB → VPCE | 불필요 | endpoint_url만 변경 | 이 구성으로 불가능 |
| [S07](scenarios/s07/2-experiment.md) | 인터넷 → public TLS NLB → CONNECT proxy → VPCE | 불필요 | boto3 프록시 설정, STS | 동작하지만 비권장 |

- S01·S02·S05는 같은 NLB를 써요. S01은 내 컴퓨터의 hosts가, S02는 프록시 호스트가 AWS 이름을 EIP로 해석하고, S05는 자체 도메인을 써서 실패해요.
- 블랙박스가 DNS·endpoint·proxy를 모두 고정하면 이 실습의 IP 고정 경로로 전환할 수 없어요.
- NLB 한 개의 TCP 443 listener는 STS/Memory를 SNI별로 나누지 못해요. 직접 통과 방식은 서비스별 NLB가 필요해요.
- CONNECT 프록시는 목적지 호스트를 구분하므로 S07은 NLB 한 개로 두 API를 처리해요.

## endpoint_url 변경과 TLS

- 임의의 NLB 도메인이나 자체 CNAME은 AWS 서비스 인증서에 추가되지 않아요. S05가 이것을 확인해요.
- endpoint 변경 자체가 SigV4를 깨뜨리지는 않아요. 서명한 뒤 프록시가 Host를 바꾸면 서명이 달라져요.
- NLB에 자체 인증서를 붙인 TLS 재암호화 직결 방식은 AWS 서비스의 Host·SNI 수용까지 검증해야 해요. S07은 CONNECT 터널로 이 문제를 피하는 구조예요.

## 최종 목적지 구분

| 목적 | boto3 client / PrivateLink service |
| --- | --- |
| 임시 자격증명 교환 | sts / com.amazonaws.ap-northeast-2.sts |
| AgentCore Memory 데이터 | bedrock-agentcore / com.amazonaws.ap-northeast-2.bedrock-agentcore |

- 코드의 최종 대상은 Memory예요. 일반 Bedrock 모델 추론(bedrock-runtime)을 추가하려면 별도의 endpoint·NLB·EIP·권한이 필요해요.
