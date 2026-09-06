# S01 로컬 실행과 방화벽 검증 기준

- 환경 준비: [S01 환경 준비와 정리](2-setup.md).
- 아키텍처와 인증 흐름: [S01 실험](scenarios/s01/2-experiment.md).
- 목적: NLB 고정 EIP 경유로 STS 임시 자격증명 발급과 Memory 접근 확인.

## 실행

가상환경을 활성화하고, hosts에 매핑한 AZ를 선택해 실행해요.

```bash
python -m scenarios.s01_public_dns_sts --az ap-northeast-2a
```

- 기본 설정 파일은 `runtime/config.json`이에요. 다른 파일은 `--config <경로>`로 지정해요.
- 시작 자격증명은 `AWS_PROFILE`이 가리키는 로컬 프로파일이에요. 환경변수 키가 남아 있으면 코드가 중단해요. [준비 단계](2-setup.md#클라이언트-프로파일과-시작-주체)를 따라요.
- Python은 먼저 OS 이름 조회 결과와 TLS peer IP·AWS 인증서를 검사해요.
- 프로파일 주체로 15분짜리 client Role 세션을 발급받아요. 장시간 자동 갱신은 이 예제 범위에 포함하지 않아요.
- AWS 호출은 STS와 Memory의 서울 URL을 유지하며, 상속된 프록시는 사용하지 않아요.
- 실험 성공·실패와 관계없이 [hosts 원복](6-hosts-setup.md#down)을 수행해요.

## 성공 기준

아래는 실제 실행 결과가 아닌 성공 시 출력 형식이에요.

```text
DNS_OK sts.ap-northeast-2.amazonaws.com -> <STS EIP>
TLS_OK sts.ap-northeast-2.amazonaws.com peer=<STS EIP> version=<TLS version>
DNS_OK bedrock-agentcore.ap-northeast-2.amazonaws.com -> <Memory EIP>
TLS_OK bedrock-agentcore.ap-northeast-2.amazonaws.com peer=<Memory EIP> version=<TLS version>
ASSUME_ROLE_OK expires=<expiration>
CALLER_IDENTITY_OK arn=<assumed role ARN>
CREATE_EVENT_OK event_id=<event ID>
GET_EVENT_OK payload_matches=true
DELETE_EVENT_OK
PASS STS AssumeRole -> AgentCore Memory through NLB EIPs
```

| 출력 | 확인하는 내용 |
| --- | --- |
| DNS_OK | 공식 AWS 도메인이 지정한 EIP 하나로만 해석 |
| TLS_OK | EIP에 접속하면서 AWS 인증서와 SNI 검증 성공 |
| ASSUME_ROLE_OK | 프로파일 주체가 STS에서 client Role 임시 자격증명 수령 |
| CALLER_IDENTITY_OK | 발급된 세션의 주체 확인 |
| GET_EVENT_OK | 그 세션으로 작성한 내용과 읽은 내용 일치 |
| DELETE_EVENT_OK | 실험 이벤트 정리 |

- Memory Role 정책의 `aws:SourceVpce` 조건은 실험용 Memory endpoint를 지정해요.
- Memory endpoint 정책은 해당 Memory·client Role·이벤트 API 세 개로 제한해요. STS endpoint 정책은 PoC라서 모든 주체의 sts:*를 허용하고, 실무 제한 예시는 Terraform 주석에 있어요.
- TLS 검증을 끄거나 TCP health check만 성공한 결과는 실험 성공으로 판정하지 않아요.

## outbound 방화벽 검증

- 로컬 Python의 PASS는 NLB 경유 호출 성공을 뜻해요. 방화벽의 다른 목적지 차단까지 증명하지는 않아요.
- 방화벽 제약을 검증할 때는 해당 환경에서 AWS API 통신 목적지를 NLB EIP TCP 443으로 제한해요.
- 일반 DNS 질의 경로는 별도로 유지해요. global STS 이름 조회가 가능하다는 사실만으로 AWS API 우회가 발생한 것은 아니에요.
- 방화벽 로그에서 NLB EIP 경유와 직접 AWS public IP 연결 차단을 함께 확인해요.
- 로컬 컴퓨터 전체의 방화벽을 자동 변경하는 코드는 포함하지 않아요.

## 다중 AZ

- 한 번에 서비스별 EIP 하나를 고정해요.
- [환경 준비](2-setup.md#up)에서 기존 hosts 블록을 제거하고 다음 AZ의 IP로 교체해요.
- hosts의 AZ와 Python의 `--az`가 다르면 DNS 검사에서 중단돼요.
- hosts 고정은 NLB DNS의 health 기반 장애조치를 따르지 않아요.
- 운영 시 DNS 분산·장애조치와 EIP 허용 목록 갱신 절차를 따로 설계해야 해요.

## ENI 교체

- NLB target에는 endpoint IP가 등록돼요. endpoint 도메인을 추적하는 기능은 아니에요.
- subnet 변경·endpoint 재생성으로 ENI가 바뀌면 target 등록도 갱신해야 해요.
- Terraform apply는 service/AZ별 ENI IP를 다시 읽어 등록해요.
- Terraform 밖의 변경을 자동 동기화하는 컨트롤러는 포함하지 않아요.
