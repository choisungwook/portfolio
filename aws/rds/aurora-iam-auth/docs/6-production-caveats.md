# 시나리오 6. IAM DB 인증은 비밀번호를 없애는 대신 연결 비용과 IAM 의존성을 들인다

## 이 시나리오의 목표

| 항목 | 내용 |
| --- | --- |
| 기능 | IAM DB 인증을 운영에 들이기 전 판단할 단점과 주의사항 |
| 쓰는 도구 | 시나리오 2~5의 측정값, AWS 공식 문서의 제약 |
| 입력 | 실습 측정값(연결 시간, token 길이, 만료 시점, 메모리) |
| 작업 | 없음(정리) |
| 달성할 것 | 도입 여부와 도입 방식(직접 연결, 커넥션 풀, RDS Proxy)을 서비스 특성으로 고를 근거 |

## 장점은 하나로 요약된다

교체해야 할 장기 DB 비밀번호가 앱에서 사라집니다. 접속 권한은 IAM policy 한 줄(`rds-db:connect`)로 주고 회수하며, 서명에 쓰는 임시 자격증명은 AWS가 갱신합니다. 사람이 DB에 접속할 때도 IAM Identity Center 같은 기존 신원으로 token을 만들면 개인 DB 비밀번호를 나눠 줄 필요가 없습니다.

아래는 그 대가입니다.

## 단점과 대응

| 영역 | 내용 | 근거 | 대응 |
| --- | --- | --- | --- |
| 연결 처리량 | 새 IAM 인증 연결은 초당 약 200개를 넘으면 throttling될 수 있습니다 | AWS troubleshooting 문서, `IamDbAuthConnectionFailureThrottling` | 커넥션 풀로 연결을 재사용하거나 RDS Proxy 앞단에서 IAM 인증 |
| 연결 지연 | 새 연결마다 TLS와 IAM 검증이 붙습니다 | 실습: 연결 9~11 ms → 17~20 ms, 요청 p50 26 ms → 41 ms | 요청마다 연결하지 않음. 풀을 쓰면 연결 생성 때만 비용 |
| DB 메모리 | 안정적인 연결에 300~1000 MiB의 여유 메모리가 필요합니다 | AWS 문서. 실습에서는 활성화 직후 1분 사이 `FreeableMemory`가 1068 MiB → 539 MiB로 줄었습니다(다른 요인과 분리 확인 못 함) | 작은 인스턴스와 0.5 ACU 고정은 피하고 Serverless v2 최대 ACU에 여유를 둠. Aurora MySQL은 `db.t2.small`, `db.t3.small` 미지원 |
| token 길이 | 임시 자격증명으로 서명하면 token이 길어집니다 | 실습: 장기 key 379자, EC2 role 1,869자 | 비밀번호 길이를 자르는 드라이버, ODBC 설정, GUI 도구를 사전에 확인 |
| 클라이언트 호환 | token을 평문 플러그인(`mysql_clear_password`)으로 보내야 하고 TLS가 필수입니다 | 실습: 플러그인 없이 `ERROR 2059`, TLS 없이 `using password: NO` | 드라이버의 cleartext 옵션과 TLS 설정. AWS Advanced JDBC, Python Wrapper의 IAM 플러그인 사용 |
| endpoint 이름 | token 서명에 hostname이 들어가므로 Route 53 사용자 DNS 이름으로 token을 만들 수 없습니다 | AWS 문서 제약 | token은 클러스터 endpoint로 서명. 사용자 DNS를 쓰는 앱은 서명용 hostname을 따로 설정 |
| 감사 기록 | token 서명이 로컬이라 CloudTrail에 `generate-db-auth-token`이 남지 않습니다 | AWS 문서 | DB audit 로그(`CONNECT`)가 접속 감사의 유일한 기록. 보존 기간을 규정에 맞춤 |
| 정책 조건 키 | `aws:SourceIp`, `aws:SourceVpc`, `aws:SourceVpce` 등은 IAM DB 인증에서 지원하지 않습니다 | AWS 문서 | 네트워크 제한은 security group이 맡음 |
| 권한 회수 | policy를 지워도 열린 세션은 유지됩니다. token도 실측 약 20분까지 받아들여졌습니다 | 실습: 15분 26초 성공, 20분 18초 `ExpiredToken` | 즉시 차단이 필요하면 DB에서 `ACCOUNT LOCK`과 세션 `KILL`을 함께 실행 |
| IAM 의존성 | 새 연결이 IAM 검증과 인스턴스 자격증명에 의존합니다 | `IamDbAuthConnectionFailureServerError` metric 존재 | 커넥션 풀로 새 연결 의존을 줄이고 `Failure*` metric에 경보 |
| master 사용자 | master(`admin`)는 password 사용자로 남습니다 | 실습 구성 | master는 Secrets Manager(`manage_master_user_password`)로 관리하고 앱은 쓰지 않음 |
| 헬스체크 | DB 인증까지 보는 health 경로는 인증 장애 하나로 전체 인스턴스를 교체시킵니다 | EC2 application status check 문서의 best practice | 프로세스 health(`/healthz`)와 DB readiness(`/readyz`)를 분리 |

## 도입 방식 고르기

| 서비스 특성 | 권장 |
| --- | --- |
| 커넥션 풀을 쓰는 상주 서비스(EC2, ECS, EKS) | 직접 IAM 인증. 풀이 새 연결마다 token을 만들도록 설정 |
| 요청마다 연결하는 짧은 실행(Lambda 등), 동시 실행 수가 큼 | RDS Proxy + IAM 인증. 처리량 한계와 연결 지연을 Proxy가 흡수 |
| 초당 새 연결이 200개에 가까운 서비스 | 풀 크기와 수명을 먼저 조정하고, 안 되면 RDS Proxy |
| 비밀번호만 지원하는 외부 도구, 벤더 앱 | password 사용자 유지 + Secrets Manager 자동 교체 |

## 운영 적용 전 점검표

1. 클러스터의 `iam-db-auth-error`와 `audit` 로그 내보내기가 켜져 있다.
2. `IamDbAuthConnectionFailure`와 앱 오류율 경보가 있다.
3. 앱 드라이버가 TLS, cleartext 플러그인, 2 KB 가까운 비밀번호를 처리한다.
4. 커넥션 풀이 새 연결마다 token을 새로 만들거나 15분 안쪽으로 캐시한다.
5. IAM policy의 리소스가 `dbuser:<cluster-resource-id>/<user>`로 사용자까지 좁혀져 있다.
6. 새 IAM 사용자의 `GRANT`와 옛 사용자 소유 객체(`DEFINER`)를 확인했다.
7. 롤백 경로(스위치 원복, `ACCOUNT UNLOCK`)를 실제로 한 번 실행해 봤다.

## 참고 문서

1. [IAM database authentication - Limitations and Recommendations](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/UsingWithRDS.IAMDBAuth.html)
2. [Troubleshooting for IAM DB authentication](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/UsingWithRDS.IAMDBAuth.Troubleshooting.html)
3. [Using Amazon RDS Proxy with IAM authentication](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/rds-proxy-setup.html)
4. [Application status checks - Best practices](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/application-status-checks.html#asc-best-practices)
