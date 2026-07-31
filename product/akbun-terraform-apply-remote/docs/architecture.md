# 아키텍처

akbun-terraform-apply-remote의 구조와 핵심 흐름을 정리한다. 설계 의도는 세 가지다.

1. PR이 생성되면 자동으로 plan하고 결과를 PR comment로 남긴다.
2. PR comment로 plan을 다시 실행하고, apply와 import를 실행할 수 있다.
3. 인증은 장기 PAT 또는 GitHub App의 임시 installation token 중 선택한다.

## 전체 구성

GitHub webhook을 받아 terraform을 실행하고 결과를 PR comment로 돌려주는 단일 바이너리 서버다.

```mermaid
flowchart LR
  subgraph GitHub
    PR[Pull Request]
    WH[Webhook]
    API[REST API]
  end

  subgraph Server[akbun-terraform-apply-remote]
    SRV[server<br/>HTTP 수신, drain]
    SIG[signature<br/>HMAC-SHA256 검증]
    EVT[events<br/>payload 해석]
    CMD[command<br/>comment 명령 파싱]
    HDL[handler<br/>오케스트레이션]
    LCK[locks<br/>프로젝트 lock]
    ST[state<br/>state.json 영속화]
    AUTH[auth<br/>PAT 또는 App token]
    GH[github<br/>API 클라이언트]
    WS[workspace<br/>PR checkout]
    TF[terraform<br/>init/plan/apply/import]
    FMT[format<br/>comment 렌더링]
  end

  DATA[(data 디렉터리<br/>checkout, plan 파일, state.json)]

  WH -->|이벤트 전달| SRV
  SRV --> SIG --> EVT --> HDL
  HDL --> CMD
  HDL --> LCK
  HDL --> ST
  HDL --> WS --> TF
  HDL --> FMT --> GH
  GH --> AUTH
  WS --> AUTH
  GH -->|comment 작성, PR 조회| API
  WS --> DATA
  ST --> DATA
  API --> PR
```

- webhook은 서명 검증을 통과해야만 처리된다. 즉시 200으로 응답하고 실제 작업은 백그라운드 스레드에서 실행해 GitHub의 10초 timeout을 피한다.
- 핵심 판단 로직(command, signature, project, format, locks, state, jobs, auth 선택)은 순수 함수/자료구조로 분리해 단위 테스트로 검증한다.

## 흐름 1: PR 생성 시 자동 plan

PR이 열리거나(head가 갱신되어도 동일) 변경 파일에 terraform 파일이 있으면 자동으로 plan하고 결과를 comment로 남긴다.

```mermaid
sequenceDiagram
  participant U as 개발자
  participant GH as GitHub
  participant S as 서버
  participant T as terraform

  U->>GH: PR 생성 / push
  GH->>S: webhook (pull_request: opened/synchronize)
  S->>S: HMAC 서명 검증
  S->>GH: 변경 파일 목록 조회
  S->>S: terraform 프로젝트 디렉터리 탐지
  S->>S: 프로젝트 lock 획득 (PR 단위)
  S->>S: PR head checkout (pull/N/head)
  S->>T: terraform init, plan -out .akbun.tfplan
  T-->>S: plan 출력
  S->>S: plan 파일 저장 + head SHA 기록
  S->>GH: plan 결과를 PR comment로 작성
  GH-->>U: comment 확인, 리뷰
```

## 흐름 2: comment로 plan / apply / import

리뷰어는 PR comment로 서버를 조작한다. apply는 새로 plan하지 않고 **마지막 plan이 저장한 파일**을 그대로 적용한다.

```mermaid
sequenceDiagram
  participant R as 리뷰어
  participant GH as GitHub
  participant S as 서버
  participant T as terraform

  R->>GH: comment "terraform apply"
  GH->>S: webhook (issue_comment)
  S->>S: 서명 검증, 명령 파싱
  S->>S: plan 기록 확인
  alt PR head가 plan 시점과 다름
    S->>GH: comment "PR이 바뀌었다, 다시 plan하라"
  else 저장된 plan이 유효
    S->>T: terraform apply .akbun.tfplan
    T-->>S: apply 출력
    S->>S: lock 해제, plan 기록 삭제
    S->>GH: apply 결과 comment
  end

  R->>GH: comment "terraform import aws_vpc.main vpc-123"
  GH->>S: webhook (issue_comment)
  S->>T: terraform import aws_vpc.main vpc-123
  T-->>S: import 출력
  S->>S: 저장된 plan 무효화 (state가 바뀌었으므로)
  S->>GH: import 결과 + 재plan 안내 comment
```

명령 요약:

| comment | 동작 |
|---|---|
| terraform plan [-d dir] | 변경된(또는 지정한) 프로젝트를 plan |
| terraform apply [-d dir] | 저장된 plan 파일을 apply |
| terraform import [-d dir] 주소 ID | 기존 리소스를 state로 import, 이후 재plan 요구 |
| terraform unlock | 이 PR의 lock 전부 해제 |
| terraform help | 사용법 안내 |

## 동시성 제어: 프로젝트 lock과 저장된 plan

- 프로젝트 디렉터리(예: aws/vpc)를 처음 plan한 PR이 lock을 잡는다. 다른 PR은 그 프로젝트를 apply 성공, PR close, unlock 전까지 건드릴 수 없다. 같은 state를 두 PR이 경쟁하는 것을 막는다.
- apply는 저장된 plan 파일과 plan 시점의 head SHA를 검증한다. 리뷰한 내용과 적용되는 내용이 항상 일치한다.
- plan이 실패하면 이전 plan 기록을 지워 오래된 plan이 apply되는 것을 막는다. lock은 유지된다(그 PR이 프로젝트를 점유 중).

## 배포와 인수인계 (takeover)

배포는 두 장치 위에서 무중단으로 동작한다. 상세는 [deploy-guide.md](./deploy-guide.md)를 본다.

```mermaid
flowchart TB
  subgraph Old[기존 인스턴스]
    O1[SIGTERM 수신] --> O2[새 webhook 수신 중단]
    O2 --> O3[진행 중 terraform 실행 완료 대기<br/>drain 최대 30분]
    O3 --> O4[종료]
  end

  subgraph Disk[data 디렉터리 EBS/EFS]
    D1[state.json<br/>lock + plan 기록]
    D2[PR checkout + plan 파일]
  end

  subgraph New[새 인스턴스]
    N1[기동] --> N2[state.json 로드]
    N2 --> N3[이전 lock과 plan을 이어받아 서비스 재개]
  end

  Old -.매 이벤트마다 저장.-> Disk
  Disk -.기동 시 로드.-> New
```

- 모든 이벤트 처리 후 lock과 plan 기록을 state.json에 저장하므로, 새 인스턴스는 배포 직전 상태에서 이어서 동작한다.
- EC2 배포는 systemd timer가 새 바이너리를 감지해 교체하는 self-deploy, ECS 배포는 rolling 교체(EFS 공유)로 같은 성질을 만든다.

## 인증: PAT 또는 GitHub App 임시 토큰

GitHub 접근 토큰은 두 방식 중 하나를 선택한다. 장기 토큰을 두고 싶지 않으면 GitHub App 방식을 쓴다.

```mermaid
flowchart LR
  subgraph PAT[방식 1: PAT]
    P1[ATR_GITHUB_TOKEN] --> P2[고정 토큰 그대로 사용]
  end

  subgraph App[방식 2: GitHub App]
    A1[App private key로<br/>JWT 서명 RS256, 9분] --> A2[POST /app/installations/ID/access_tokens]
    A2 --> A3[installation token 발급<br/>유효 1시간]
    A3 --> A4[캐시, 만료 10분 전 자동 재발급]
  end

  P2 --> USE[GitHub API 호출과 git fetch에 사용]
  A4 --> USE
```

- App 방식에서는 장기 자격증명이 런타임에 존재하지 않는다. private key는 디스크에만 있고, 실제로 쓰이는 토큰은 1시간짜리 installation token이다.
- 토큰은 API 호출과 git fetch 시점마다 provider에서 꺼내 쓰므로, 긴 작업 중에도 만료 전에 자동 갱신된다.
- git fetch는 토큰을 remote URL에 넣지 않고 Authorization 헤더로만 전달해 디스크에 토큰이 남지 않는다.
- App 설정 절차는 [user-guide.md](./user-guide.md)의 인증 옵션 절을 따른다.
