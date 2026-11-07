# 시나리오 6. IAM DB 인증의 트레이드오프와 프로덕션 운영 고려사항

## 시나리오 개요 및 핵심 목표

| 항목 | 상세 내용 |
| --- | --- |
| **핵심 주제** | IAM DB 인증을 실제 프로덕션 워크로드에 도입하기 전 종합적으로 검토해야 할 기술적 제약과 트레이드오프 |
| **분석 기준** | 시나리오 2~5의 실제 실측치(연결 지연, 토큰 길이, 만료 시점, 메모리 점유) 및 AWS 공식 서비스 제약 |
| **활용 도구** | RDS CloudWatch 메트릭, Aurora MySQL 설정, RDS Proxy 아키텍처 패턴 |
| **최종 달성 목표** | 워크로드 특성(서버리스, 컨테이너, 레거시 등)에 따른 최적의 데이터베이스 인증 아키텍처(직접 연결, 커넥션 풀, RDS Proxy) 선정 기준과 운영 체크리스트 수립 |

## IAM DB 인증의 핵심 가치

IAM DB 인증을 도입함으로써 얻는 가장 결정적인 이점은 **주기적으로 순환하고 동기화해야 하는 정적 DB 비밀번호를 애플리케이션 환경에서 완전히 제거할 수 있다는 점**입니다.

데이터베이스 접근 통제가 IAM 정책(`rds-db:connect`) 한 줄로 통합되며, 서명에 사용되는 임시 보안 자격증명은 AWS 인프라(인스턴스 메타데이터 서비스 등)가 자동으로 순환합니다. 또한 개발자나 DBA가 데이터베이스에 직접 접속할 때도 AWS IAM Identity Center(SSO)와 연동하여 개인별 단기 토큰을 생성할 수 있으므로, 공용 계정 패스워드를 외부에 공유하거나 로컬 파일에 보관할 필요가 없습니다.

그러나 이러한 편의성과 보안성 이면에는 다음과 같은 명확한 비용과 아키텍처적 트레이드오프가 존재합니다.

## 한계점 및 영역별 대응 전략 (Trade-offs)

실무 엔지니어링 환경에서 반드시 사전 검토해야 할 제약 사항과 권장 대응 방안입니다.

| 제약 영역 | 주요 내용 및 실무 영향 | 핸즈온 실측 및 공식 근거 | 권장 대응 방안 |
| --- | --- | --- | --- |
| **연결 처리량 한계** | 신규 IAM 인증 연결은 **초당 약 200회**를 초과할 경우 내부 스로틀링(Throttling)이 발생할 수 있습니다. | AWS 공식 한계 가이드, CloudWatch `IamDbAuthConnectionFailureThrottling` 지표 존재 | 커넥션 풀(HikariCP 등)을 통해 연결을 적극 재사용하거나, 연결 폭증 구간에는 **RDS Proxy**를 앞단에 배치하여 인증을 위임합니다. |
| **연결 지연 오버헤드** | 연결을 새로 맺을 때마다 TLS 암호화 핸드셰이크와 Aurora-IAM 간의 서명 검증 통신이 수반됩니다. | 핸즈온 실측: 연결 수립 9~11 ms → 17~20 ms, 요청 p50 지연 26 ms → 41 ms로 증가 | 요청마다 매번 커넥션을 수립하는 설계를 지양하고, 커넥션 풀을 필수 적용하여 연결 오버헤드를 초기 기동 시점으로 국소화합니다. |
| **DB 메모리 요구량** | 안정적인 IAM 인증 처리를 위해 데이터베이스 인스턴스에 **약 300~1000 MiB 수준의 여유 메모리**가 필요합니다. | AWS 공식 문서 명시. 실습 환경에서 활성화 직후 1분간 `FreeableMemory`가 1,068 MiB에서 539 MiB로 일시 감소 | 초소형 인스턴스(`db.t2.small`, `db.t3.small`은 Aurora MySQL에서 지원 불가)를 피하고, Serverless v2는 최대 ACU를 2 이상으로 넉넉히 설정합니다. |
| **토큰 길이 확장** | STS 임시 보안 자격증명으로 서명할 경우 세션 토큰이 추가되어 토큰 문자열이 대폭 늘어납니다. | 핸즈온 실측: 영구 액세스 키 서명 시 379자, EC2 IAM Role(STS) 서명 시 **1,869자** | DB 클라이언트 드라이버, ORM, ODBC 라이브러리, 레거시 GUI 도구가 2 KB 이상의 긴 패스워드 문자열을 자르지 않고 온전히 전달하는지 검증합니다. |
| **클라이언트 호환성** | 토큰은 클리어텍스트 플러그인(`mysql_clear_password`)을 통해 전송되어야 하며, **TLS 전송 암호화가 강제**됩니다. | 플러그인 미지정 시 `ERROR 2059`, TLS 미적용 시 `using password: NO` 거절 | 클라이언트 드라이버의 `cleartext` 옵션 활성화 및 최신 RDS CA 번들 인증서(`global-bundle.pem`)를 애플리케이션에 탑재합니다. |
| **엔드포인트 명명 제약** | 토큰 서명 파라미터에 데이터베이스 Hostname이 포함되므로, Route 53 사용자 정의 CNAME 주소로는 토큰 생성이 불가능합니다. | AWS 공식 제약 사항 | 토큰 생성 시에는 반드시 Aurora 클러스터의 원본 엔드포인트를 지정하고, 사용자 DNS를 쓰는 앱은 서명용 Hostname을 분리 설정합니다. |
| **감사(Audit) 기록 부재** | 토큰 발급은 로컬 오프라인 서명이므로 AWS CloudTrail에 `generate-db-auth-token` 이벤트가 기록되지 않습니다. | AWS 공식 동작 원리 | 누가 언제 데이터베이스에 접근했는지 감사하기 위해 Aurora Advanced Auditing(`server_audit_events=CONNECT`) 로그를 반드시 보존합니다. |
| **IAM 정책 조건 키 미지원** | `aws:SourceIp`, `aws:SourceVpc`, `aws:SourceVpce` 등의 네트워크 조건 키를 IAM DB 인증 정책에서 평가하지 못합니다. | AWS 공식 제약 사항 | IP 및 네트워크 레벨의 접근 통제는 IAM이 아닌 VPC 보안 그룹(Security Group)과 네트워크 ACL에 위임합니다. |
| **권한 즉시 회수 한계** | IAM 정책을 삭제하더라도 이미 연결된 활성 세션은 유지되며, 발급된 토큰도 실측 약 20분간 유효합니다. | 핸즈온 실측: 15분 경과 후에도 접속 성공, 약 20분 18초 시점에 최종 만료 | 특정 계정을 즉시 강제 차단해야 하는 비상 상황에서는 DB 레벨의 `ALTER USER ... ACCOUNT LOCK`과 세션 `KILL` 명령을 병행합니다. |
| **IAM 서비스 의존성** | 데이터베이스 신규 연결 처리가 외부 AWS IAM 서비스 가용성에 종속됩니다. | `IamDbAuthConnectionFailureServerError` 메트릭 존재 | 커넥션 풀을 통해 신규 연결 빈도를 극소화하고, IAM 실패 메트릭에 대해 임계치 알람을 구성합니다. |
| **마스터 계정 관리** | 데이터베이스 최고 관리자 계정(`admin`)은 IAM 인증으로 전환할 수 없으며 비밀번호 방식으로 남습니다. | Aurora 엔진 기본 제약 | 마스터 계정은 AWS Secrets Manager의 자동 비밀번호 관리(`manage_master_user_password`)로 보호하고 일반 애플리케이션에 노출하지 않습니다. |
| **헬스체크 설계 주의** | DB 인증 상태를 확인하는 엔드포인트를 EC2 기본 상태 검사나 인스턴스 헬스체크로 사용하면 대규모 교체 장애가 발생합니다. | EC2 Application Status Check 모범 사례 | 인스턴스 프로세스 생존 검사(`/healthz`)와 DB 의존성 검사(`/readyz`)를 철저히 분리합니다. |

## 워크로드 특성별 아키텍처 권장안

애플리케이션의 아키텍처 특성에 따라 가장 권장되는 데이터베이스 인증 모델입니다.

| 워크로드 및 인프라 특성 | 권장 아키텍처 모델 | 아키텍처 설계 근거 |
| --- | --- | --- |
| **상주형 컨테이너/VM 서비스 (EC2, ECS, EKS)** | **직접 IAM DB 인증 + 커넥션 풀링** | 애플리케이션 내부의 커넥션 풀(HikariCP, DBCP 등)이 연결을 장기 유지하므로 초당 200회 연결 제한이나 연결 지연 오버헤드의 영향을 받지 않습니다. 풀 생성 시 새로운 토큰을 동적으로 주입하도록 구성합니다. |
| **서버리스/단기 실행 함수 (AWS Lambda 등)** | **RDS Proxy + IAM 인증** | 람다의 동시성 급증 시 인스턴스마다 새 연결을 수립하면 IAM 초당 200회 한계에 즉시 도달합니다. 클라이언트는 RDS Proxy와 IAM 인증으로 통신하고, 프록시가 DB 커넥션을 재사용하도록 설계합니다. |
| **초당 신규 연결이 빈번한 대규모 분산 앱** | **RDS Proxy 도입 검토** | 커넥션 풀 크기 및 `maxLifetime`을 최적화하고, 개선이 어려울 경우 RDS Proxy를 전면에 배치하여 Aurora 엔진의 인증 부하를 경감합니다. |
| **외부 상용 솔루션 및 레거시 배치 도구** | **패스워드 사용자 유지 + Secrets Manager** | `mysql_clear_password` 플러그인이나 2 KB 토큰을 지원하지 않는 서드파티 소프트웨어는 패스워드 방식을 유지하되, Secrets Manager의 자동 로테이션으로 보안을 유지합니다. |

## 프로덕션 적용 전 체크리스트

실제 프로덕션 환경에 IAM DB 인증을 적용하기 전 확인해야 할 7가지 점검 항목입니다.

- [ ] **1. 감사 및 에러 로그 스트리밍 활성화**: Aurora 클러스터에 `iam-db-auth-error` 및 `audit`(`server_audit_events=CONNECT`) 로그 그룹 내보내기 설정이 켜져 있는가?
- [ ] **2. 핵심 장애 메트릭 알람 구성**: CloudWatch `IamDbAuthConnectionFailure` 및 애플리케이션의 데이터베이스 연결 실패율 지표에 임계치 알람이 등록되어 있는가?
- [ ] **3. 클라이언트 드라이버 호환성 사전 검증**: 애플리케이션이 사용하는 DB 드라이버가 TLS 연결, `mysql_clear_password` 플러그인, 2 KB 수준의 긴 패스워드 문자열을 정상 지원하는가?
- [ ] **4. 커넥션 풀의 토큰 갱신 로직 검증**: 커넥션 풀이 새로운 물리 연결을 맺을 때마다 정적 캐시가 아닌 최신 유효 토큰(10~15분 이내)을 동적으로 재발급받도록 구성되었는가?
- [ ] **5. IAM 정책의 최소 권한 원칙 준수**: 인스턴스 Role에 부여된 `rds-db:connect` 정책의 리소스가 와일드카드(`*`)가 아닌 특정 DB 계정(`dbuser:<cluster-id>/<db_user>`)으로 명확히 제한되어 있는가?
- [ ] **6. 데이터베이스 객체 권한 및 소유권(`DEFINER`) 검증**: 신규 IAM 사용자에게 기존 사용자와 동일한 `GRANT`가 부여되었으며, View 및 Stored Procedure의 `DEFINER` 소유권 의존성이 정리되었는가?
- [ ] **7. 롤백 시나리오 모의 검증**: 비상 상황 발생 시 즉각적인 롤백 절차(인증 스위치 원복, 구 계정 `ACCOUNT UNLOCK` 등)를 사전 리허설하고 실행 절차를 문서화했는가?

## 참고 문서

1. [IAM database authentication - Limitations and Recommendations](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/UsingWithRDS.IAMDBAuth.html)
2. [Troubleshooting for IAM DB authentication](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/UsingWithRDS.IAMDBAuth.Troubleshooting.html)
3. [Using Amazon RDS Proxy with IAM authentication](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/rds-proxy-setup.html)
4. [Application status checks - Best practices](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/application-status-checks.html#asc-best-practices)
