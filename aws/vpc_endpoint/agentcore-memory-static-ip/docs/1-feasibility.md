# S01 가능 여부와 설계 근거

- 전체 비교: [요구사항과 시나리오 분류](0-requirements.md).
- 연결·인증 그림: [S01 아키텍처와 실험](scenarios/s01/2-experiment.md#아키텍처).

- 조건부로 가능한 구성이에요. 두 AWS 도메인을 각 NLB의 EIP(고정 공인 IPv4)로 해석하고, TLS를 그대로 전달하는 방식이에요.
- AWS가 문서화한 NLB·PrivateLink 기능을 조합한 설계이며, 이 조합의 실제 AWS 성공 여부는 [검증 상태](4-validation.md)에서 구분해요.
- 실험의 최종 대상은 AgentCore Memory의 단기 이벤트 저장·조회예요.

## IAM과 STS 구분

| 구분 | 이 실험에서 하는 일 | 클라이언트 통신 |
| --- | --- | --- |
| IAM | Role·정책으로 권한 정의 | 런타임 IAM API 호출 없음 |
| STS | AssumeRole로 임시 access key·secret key·session token 발급 | 서울 STS endpoint 호출 |
| SigV4 | 자격증명으로 각 요청에 서명 | boto3가 로컬에서 계산 |
| AgentCore Memory | 요청의 인증·권한 확인 후 이벤트 저장·조회 | 서울 data plane 호출 |

- STS 호출에도 기존 AWS 자격증명이 필요해요. NLB나 IP 허용 목록이 자격증명을 만들어 주지는 않아요.
- STS endpoint policy는 PoC라서 모든 주체의 sts:*를 허용해요. 같은 컴퓨터의 관리 호출까지 endpoint를 지나기 때문이고, 실무 제한 예시는 Terraform 주석에 있어요.
- 발급받은 임시 자격증명은 매 Memory 요청의 서명에 사용해요.
- [서울 STS endpoint](https://docs.aws.amazon.com/general/latest/gr/sts.html): `sts.ap-northeast-2.amazonaws.com`.
- STS에는 global endpoint도 있어요. 이 실험은 URL과 서명 리전을 명시해 global endpoint 사용을 방지해요.
- [AgentCore 지원 리전](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html)에서 Seoul의 Memory 지원을 확인할 수 있어요.

## 네트워크 경로

- NLB 대상: interface endpoint ENI(네트워크 인터페이스)의 사설 IPv4.
- [AgentCore PrivateLink](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/vpc-interface-endpoints.html)는 Memory data plane을 지원해요.
- [STS PrivateLink](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sts_vpc_endpoint_create.html)는 regional STS endpoint와 함께 사용해요.
- NLB listener와 target group 모두 TCP 443. TLS 복호화는 AWS 서비스에서 수행해요.
- [NLB TCP listener](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-listeners.html)는 암호화된 요청을 그대로 전달할 수 있어요.
- [PrivateLink ENI 대상 제약](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/edit-target-group-attributes.html)에 따라 `preserve_client_ip = false`로 설정해요.
- Proxy Protocol v2도 꺼요. AWS HTTPS endpoint 앞에 별도 헤더가 붙지 않아야 해요.

## DNS와 Route 53

| 클라이언트가 사용하는 이름 | 로컬 컴퓨터에서 해석하는 IP |
| --- | --- |
| sts.ap-northeast-2.amazonaws.com | STS NLB EIP |
| bedrock-agentcore.ap-northeast-2.amazonaws.com | Memory NLB EIP |

- 로컬 `/etc/hosts`에서 두 이름을 매핑하고, 실습 종료 후 추가한 항목을 제거해요.
- 실제 URL·TLS SNI·인증서 검증 이름·HTTP Host·SigV4 호스트는 AWS 도메인을 유지해요.
- NLB 도메인이나 `sts.example.com`을 `endpoint_url`로 넣으면 AWS 인증서의 이름과 달라져요.
- Route 53 별칭만 만들어서는 TLS 이름과 서명 문제가 해결되지 않아요.
- ACM은 필요하지 않아요. Route 53 레코드는 [S05 실패 실험](scenarios/s05/2-experiment.md)용 alias 하나만 만들어요.
- NLB 하나의 443 listener는 SNI에 따라 STS와 Memory target group을 나눌 수 없어요. 두 서비스 모두 443을 쓰도록 NLB 두 개를 사용해요.
- DNS 변경 불가 조건은 [S07 공개 프록시](scenarios/s07/2-experiment.md)로 분리해요.

## 실험 범위

- 기본: default VPC, AZ 1개, NLB 2개, EIP 2개, interface endpoint 2개, Memory 1개, client Role 1개.
- AZ를 2개로 늘리면 EIP 4개와 endpoint ENI 4개가 필요해요.
- AZ 1개와 개별 EIP 고정은 가용성 검증에 적합하지 않아요. 다중 AZ에서는 각 AZ를 따로 실험해요.
- EC2·NAT Gateway·S3·AgentCore Runtime 배포는 필요하지 않아요.
- Terraform의 리소스 생성 경로는 관리 PC의 인터넷 연결을 사용해요.
- S01의 시작 자격증명은 로컬 AWS 프로파일이에요. Terraform은 키를 만들지 않고 trust 대상 ARN만 입력받아요.
- 장기 Memory 추출 전략은 만들지 않아요. [장기 Memory의 cross-region inference](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/cross-region-inference.html)를 포함하려면 데이터 처리 리전을 별도로 검토해야 해요.
