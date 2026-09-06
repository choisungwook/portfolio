# 운영에서 알아야 할 것

- 운영의 핵심은 인증서 발급 권한, 개인 키 보관, 갱신 경로, 폐기와 세션 권한 회수예요.
- 이 실습의 로컬 CA·파일 개인 키·단일 CN은 학습용 구성이에요.

## 인증서 발급과 신원 설계

| 결정 | 운영에서 확인할 것 |
| --- | --- |
| 발급 주체 | 누가 어느 workload의 인증서를 발급·재발급할 수 있는지 |
| 식별 정보 | CN·SAN URI 등 조직이 통제하는 속성과 Role 매핑 |
| Role 분리 | 서비스·환경·권한별로 피해 범위를 나눌지 |
| CA 분리 | 운영·개발 또는 조직별 발급 권한을 분리할지 |
| 체인 | Root·Intermediate의 전달, 만료, 교체 순서 |

- CA를 신뢰하는 것만으로 Role trust 구성을 끝내지 않아요.
- 실습은 trust anchor ARN·계정·CN을 제한해요. 운영에서 사용하는 속성은 인증서 발급 절차에서 보장해야 해요.
- 클라이언트가 CSR의 CN을 자유롭게 지정하고 CA가 그대로 서명하면 속성 기반 제한의 의미가 약해져요.
- 같은 CN의 여러 인증서는 같은 Role 조건에 맞아요. CN 1개를 공유하면 개별 workload를 구분하기 어려워져요.
- 인증서 chain에 intermediate CA가 있으면 helper의 `--intermediates`와 AWS trust anchor 구성을 함께 확인해요. [Role trust 모델](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/trust-model.html)

## 개인 키 보관과 배포

- CA 개인 키는 인증서 발급 환경에 두고 workload에 배포하지 않아요.
- Leaf 개인 키도 복사 가능한 비밀이에요. 장기 AWS access key를 없애도 보호할 비밀 자체가 사라지지는 않아요.
- 실습의 0600 파일 권한은 최소한의 로컬 접근 제한이에요.
- Git·Terraform state·로그·일반 설정 저장소에 개인 키나 임시 자격증명을 넣지 않아요.
- 운영에서는 OS 키 저장소, PKCS#11/HSM, TPM 등 helper가 지원하는 서명 수단을 검토해요.
- 이 샘플의 Python 경로 검사는 일반 파일용이에요. HSM URI나 OS selector를 사용할 때는 helper 명령을 생성하는 부분을 맞춰야 해요. [공식 helper의 키 저장소 지원](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/credential-helper.html)

## 인증서 교체

1. 기존 인증서가 유효할 때 새 개인 키·인증서를 발급해요.
2. 새 체인과 workload 식별 속성을 검증해요.
3. 인증서와 키를 1개의 배포 단위로 전환해요.
4. 새 CreateSession과 실제 서비스 접근을 확인해요.
5. 기존 인증서의 사용 종료를 확인한 뒤 폐기하고 CRL을 갱신해요.

- 파일 경로를 고정한 채 교체한다면 인증서와 키가 서로 다른 버전으로 읽히는 순간을 방지해요.
- 버전 디렉터리를 만들고 배포 단위로 전환하거나 프로세스를 재시작하는 절차를 정해요.
- 새 프로세스에서도, 이미 실행 중인 SDK의 다음 갱신에서도 성공하는지 확인해요.
- CA를 교체할 때는 새로운 trust anchor·Role trust 변경·기존 체인 종료의 순서까지 정해야 해요.
- AWS Private CA를 trust anchor로 사용한다면 CA 유효기간을 변경할 때 UpdateTrustAnchor에도 반영됐는지 확인해요. [Trust anchor 유효성](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/trust-model.html)

## CRL 운영

- CRL은 인증 기관이 서명한 폐기 인증서 목록이에요.
- AWS는 CA의 CRL Distribution Point나 OCSP 주소를 자동 호출하지 않아요.
- ImportCrl/UpdateCrl로 최신 목록을 전달하는 배포 경로가 필요해요.
- 새 폐기 내역뿐 아니라 기존 폐기 내역도 포함한 전체 CRL을 유지해요.
- CA 발급 DB와 serial 관리 정보가 유실되면 정상적인 폐기 목록을 생성하기 어려워져요.
- 이 실습의 CRL 유효기간은 2일이에요. 운영 주기는 장애 복구에 필요한 여유를 고려해 정해요.
- CRL의 `nextUpdate` 전에 재발급·업로드하고 실패 알림을 연결해요. [CRL 동작](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/trust-model.html#revocation), [UpdateCrl API](https://docs.aws.amazon.com/rolesanywhere/latest/APIReference/API_UpdateCrl.html)

실습 CA의 발급 DB를 바탕으로 CRL을 다시 만들고 등록된 목록을 갱신해요.

```bash
python -m scripts.generate_crl
python -m scripts.update_crl
```

CRL의 발행·갱신 기한을 확인해요.

```bash
openssl crl -in runtime/pki/ca/revoked.pem -noout -lastupdate -nextupdate
```

## 사고 대응과 세션 권한 회수

| 조치 | 주로 차단하는 대상 | 남는 영향 |
| --- | --- | --- |
| 인증서 폐기 + 활성 CRL 갱신 | 해당 인증서의 새 CreateSession | 이미 발급된 키의 만료/권한은 별도 |
| Trust anchor/profile 비활성화 | 관련 경로의 새 CreateSession | 정상 workload의 새 인증도 중단 |
| Role trust 강화 | 조건 밖 주체의 새 Role 세션 | 기존 세션에 대한 권한 판단은 별도 |
| Role 세션 권한 회수 | 지정 시각 이전에 발급된 세션의 AWS 접근 | 같은 Role을 쓰는 정상 세션도 영향 |

- 유출된 Leaf 키로 새 세션을 받는 경로를 먼저 차단해요.
- 이미 발급된 세션이 남았으면 IAM의 Revoke sessions 또는 `aws:TokenIssueTime` 조건의 명시적 Deny를 검토해요.
- IAM의 Role 세션 회수는 해당 Role의 여러 사용자를 함께 차단할 수 있어요.
- 차단 대상 Role·발급 시각·영향 범위를 먼저 확정해요.
- 정상 workload는 새 인증서로 재인증하고 실제 서비스 권한 복구까지 확인해요.
- 정책·CRL 변경의 전파 지연을 고려해 차단 여부를 재확인해요. [AWS의 Role 세션 권한 회수](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_revoke-sessions.html)

## SDK 갱신과 장애

- `credential_process`의 Expiration을 SDK에 그대로 전달해요.
- 장시간 프로세스는 세션·client를 재사용하고 갱신 실패율을 관찰해요.
- 프로세스마다 provider가 있으면 동시에 helper를 실행할 수 있어요. 시작 시각 분산·재시도 간격·서비스 quota를 확인해요.
- 갱신 시 Roles Anywhere 접속 실패, 인증서 유효기간 만료, 파일 권한 변경, 잘못된 profile 설정이 모두 장애 원인이 될 수 있어요.
- 유효한 기존 자격증명이 남아 있어도 SDK의 갱신 단계에 따라 요청이 실패할 수 있어요. 만료 직전까지 항상 동작한다고 가정하지 않아요.
- NTP 등 시스템 시각 동기화를 유지해요. 서명 시각과 인증서 유효기간 판정에 영향을 줘요.
- 세션 길이를 늘리면 갱신 빈도는 줄지만 탈취된 세션이 유효할 수 있는 기간도 늘어요.
- 이 실습은 helper·profile·Role 최대 시간을 모두 3600초로 맞췄어요.

## 감사와 모니터링

| 신호 | 해석 |
| --- | --- |
| CloudTrail CreateSession | 새 자격증명 발급과 실패 조사 |
| 기본 Role session name | 인증서 serial과 연결 가능 |
| Source identity·인증서 속성 | 어떤 workload 신원으로 요청했는지 연결 |
| AWS/RolesAnywhere Success | Operation·TrustAnchorArn 기준 성공 횟수 |
| AWS/RolesAnywhere Failure | Operation·ErrorType 기준 실패 횟수 |
| AWS/RolesAnywhere DaysToExpiry | trust anchor 인증서 만료 관찰 |
| Leaf 만료·CRL nextUpdate | 별도의 인증서/PKI 모니터링 필요 |

- DaysToExpiry만으로 모든 Leaf 인증서의 만료를 감시한다고 가정하지 않아요.
- 기본 Role session name은 인증서 serial이므로 인증서 교체 후 값이 달라져요.
- custom role session name을 허용하면 serial 기반 추적 방식을 함께 조정해요.
- Memory 요청의 성공·권한 오류와 CreateSession 성공을 별도로 관찰해요.
- 자격증명 응답 본문·개인 키·debug 출력 전체를 감사 로그로 남기지 않아요.
- 근거: [CloudTrail 기록](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/logging-using-cloudtrail.html), [CloudWatch 지표](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/monitoring-cloudwatch.html).

관리 환경에서 서울 Roles Anywhere 이벤트 목록을 조회해요.

```bash
aws cloudtrail lookup-events --region ap-northeast-2 \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=rolesanywhere.amazonaws.com \
  --query 'Events[].{Time:EventTime,Name:EventName,Id:EventId}' --output table
```

Leaf 인증서가 24시간 이내에 만료되는지 검사하고, 이 조건에 해당하면 종료 코드 1을 반환해요.

```bash
openssl x509 -in runtime/pki/clients/v2/client.crt -checkend 86400 -noout
```

## 네트워크 운영

- 인증서 기반 인증과 네트워크 도달성은 독립적으로 운영해요.
- 기본 실습의 public endpoint IP는 고정 IP 허용 목록 실험 대상이 아니에요.
- VPN 경로에서는 Roles Anywhere·Memory 각각의 VPCE와 왕복 라우팅을 확인해요.
- DNS를 바꾸지 못하면 VPCE URL 지정 또는 HTTPS CONNECT 프록시 지원 여부를 확인해요.
- 프록시를 쓰면 helper와 boto3 양쪽에 설정해요. 한쪽만 설정하면 인증 또는 데이터 호출이 실패할 수 있어요.
- CreateSession의 VPCE 정책은 `Principal="*"`가 필요해요. trust anchor ARN과 인증서 속성으로 제한해요. [Roles Anywhere PrivateLink 정책](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/vpc-interface-endpoints.html)
- [네트워크 조건별 실습](../../../vpc_endpoint/agentcore-memory-static-ip/README.md)에서 NLB 경유 여부까지 구분해요.
