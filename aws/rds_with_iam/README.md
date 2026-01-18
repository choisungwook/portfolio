# 개요

- 이 글은 AWS RDS IAM 인증 실습을 위한 예제코드입니다. 테라폼 코드, 스프링부트 애플리케이션, DB 초기화 스크립트 등을 포함하고 있습니다.
- 이론 설명은 저의 블로그를 참고하세요.

블로그 링크: https://malwareanalysis.tistory.com/892

## 디렉터리 구조

- [terraform](./terraform/)
- [springboot](./app/springboot/iam-auth/)
- [DB 초기화 스크립트](./scripts/)
- [핸즈온 문서](./docs/)

## 아키텍처

- 간단한버전

```mermaid
sequenceDiagram
    autonumber
    participant Client as Client
    participant SDK as AWS SDK/CLI
    participant Cred as STS/IAM Credentials
    participant RDS as Amazon RDS

    Client->>SDK: generate-db-auth-token 호출
    SDK->>Cred: AWS 자격증명 조회/사용<br/>(IAM User/Role, STS 임시크리덴셜 포함)
    SDK-->>Client: RDS IAM auth token 반환

    Client->>RDS: DB 접속 시도<br/>(user + auth token)
    RDS->>Cred: 토큰 서명 및 권한 검증<br/>(IAM 정책·rds-db:connect)
    Cred-->>RDS: Allow / Deny

    alt Allow
        RDS-->>Client: DB 세션 생성
    else Deny
        RDS-->>Client: 인증 실패
    end
```

- 자세한버전

```mermaid
sequenceDiagram
    autonumber
    participant Client as Client
    participant SDK as AWS SDK/CLI
    participant STS as AWS STS
    participant IAM as AWS IAM
    participant RDS as Amazon RDS

    Note over Client,STS: (사전 단계) Client/환경이 STS를 통해<br/>IAM Role 자격증명 획득 (AssumeRole 등)

    Client->>SDK: generate-db-auth-token 호출<br/>(host, port, region, dbUser)
    SDK->>STS: (필요 시) AssumeRole/STS 호출로<br/>임시 자격증명 획득
    STS-->>SDK: AccessKey/SecretKey/SessionToken
    SDK->>SDK: SigV4 서명 수행<br/>(RDS IAM auth token 생성)
    SDK-->>Client: RDS IAM auth token 반환<br/>(15분 유효)

    Client->>RDS: DB 접속 시도<br/>(user = dbUser, password = auth token)
    Note over RDS,IAM: RDS가 토큰의 SigV4 서명 정보를 바탕으로<br/>IAM 정책·DB 리소스 정책으로 rds-db:connect 권한 평가

    RDS->>IAM: 토큰 서명 검증 및 권한 확인
    IAM-->>RDS: Allow 또는 Deny

    alt Allow
        RDS-->>Client: DB 세션 생성 성공
    else Deny 또는 Token 만료
        RDS-->>Client: 인증 실패/접속 거부
    end
```
