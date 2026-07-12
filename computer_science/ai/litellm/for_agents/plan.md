# LiteLLM 3시간 학습 가이드 · 실습 환경 구축 plan

이 문서는 다른 세션(Opus 등)이 이어서 구현하기 위한 자기완결적 plan이다. 이 plan을 읽는 agent는 먼저 workspace의 [AGENTS.md](../AGENTS.md)와 [adr/](../adr/)를 읽고 시작한다.

## 배경과 목표

2026년 5월 기준, 엔터프라이즈(규모가 큰 기업, 보안이 엄격한 기업)가 AI를 도입할 때 가장 먼저 찾는 것이 AI gateway다. LiteLLM은 그 대표 오픈소스 구현이다. 이 workspace의 목표는 두 가지다.

1. LiteLLM을 전혀 모르는 사람이 3시간 안에 "엔터프라이즈가 AI gateway에 요구하는 기능"을 직접 만져보는 학습 가이드(docs/)를 만든다.
2. 그 기능을 재현하는 실습 환경 IaC 두 트랙을 만든다.

- Track A: 로컬 docker compose (인터넷 가능, GPT + Gemini 라우팅)
- Track B: Terraform으로 만드는 완전 폐쇄 private subnet + EC2 (인터넷 불가, Bedrock 라우팅)

## 엔터프라이즈 AI gateway 요구 기능 정의

학습 가이드의 뼈대다. job description에서 반복되는 요구를 기준으로 정의했고, 각 기능이 LiteLLM의 어떤 기능과 어느 실습에 대응하는지 매핑한다.

| 요구 기능 | LiteLLM 대응 기능 | 실습 위치 |
|---|---|---|
| model 다중 선택·장애 대응 | model_list 라우팅, fallbacks, load balancing | Track A |
| 인증/인가 | master key, virtual key, team, key별 model 제한 | Track A |
| token rate limit | key/team 단위 RPM·TPM limit, max_budget | Track A |
| audit / 비용 추적 | spend tracking(DB), spend logs, audit log | Track A |
| 가드레일 | guardrails 설정(요청/응답 hook, PII masking 등) | Track A |
| 인터넷이 안 되는 곳에 구축 | VPC endpoint 경유 Bedrock 라우팅, 폐쇄망 배포 | Track B |

구현 시 주의: LiteLLM은 일부 기능이 enterprise(유료) tier다. 구현 세션은 docs.litellm.ai에서 OSS/enterprise 경계를 확인하고, enterprise 전용이면 문서에 "enterprise 기능이며 OSS에서는 이렇게 대체한다"를 명시한다. 예상 경계: virtual key·team·budget·rate limit·spend tracking은 OSS(Postgres 필요), audit log(store_audit_logs)와 SSO는 enterprise일 가능성이 높다. audit의 OSS 대체는 spend logs 테이블 조회와 callback(예: 표준 logging callback) 조합으로 보여준다.

## 산출물 디렉터리 구조

구현이 끝나면 workspace는 아래 구조가 된다.

```text
computer_science/ai/litellm/
├── README.md                # 문서 링크 허브 (A4 반 장 이내)
├── AGENTS.md                # agent 맥락 (이미 있음, 구현 후 갱신)
├── adr/                     # workspace ADR (이미 있음)
├── for_agents/plan.md       # 이 문서
├── docs/
│   ├── 1-why-ai-gateway.md
│   ├── 2-routing.md
│   ├── 3-auth-rate-limit.md
│   ├── 4-audit-guardrails.md
│   └── 5-airgapped-bedrock.md
├── docker/                  # Track A
│   ├── docker-compose.yaml
│   ├── config.yaml          # litellm proxy 설정
│   └── .env.example
└── terraform/               # Track B
    ├── terraform.tf
    ├── providers.tf
    ├── variables.tf
    ├── outputs.tf
    ├── vpc.tf
    ├── vpc_endpoints.tf
    ├── ec2.tf
    ├── iam.tf
    ├── security_group.tf
    ├── data.tf
    └── terraform.tfvars.example
```

## 3시간 학습 커리큘럼 (docs/ 계획)

각 문서는 A4 1장 목표, 결론 먼저 3문장 이내. 문서마다 "검증" 절을 두고 실제 curl 결과로 끝낸다.

| 시간 | 문서 | 내용 |
|---|---|---|
| 0:00–0:20 | 1-why-ai-gateway.md | AI gateway가 무엇인지, 엔터프라이즈 요구 기능 6가지 표, LiteLLM 아키텍처(proxy + Postgres) 한 장 그림 |
| 0:20–1:00 | 2-routing.md | docker compose 기동, config.yaml에 GPT·Gemini 등록, 같은 endpoint로 두 모델 호출, fallback 실험(잘못된 key로 GPT를 죽이고 Gemini로 넘어가는지) |
| 1:00–1:40 | 3-auth-rate-limit.md | master key로 virtual key 발급, key별 접근 model 제한, RPM·TPM limit 걸고 429 확인, max_budget 소진 실험 |
| 1:40–2:10 | 4-audit-guardrails.md | spend logs로 누가 어떤 모델에 얼마 썼는지 조회, guardrail 하나(PII masking 또는 금칙어) 적용하고 차단 확인, audit log의 OSS/enterprise 경계 정리 |
| 2:10–3:00 | 5-airgapped-bedrock.md | 폐쇄망 아키텍처 설계 리뷰(VPC endpoint 표 포함), terraform apply, SSM으로 접속해 EC2 안에서 LiteLLM 기동, Bedrock 모델 호출. 시간이 없으면 설계 리뷰까지만 하고 apply는 선택으로 둔다 |

## Track A: docker compose 사양

위치는 docker/. 서비스는 두 개로 최소화한다.

- litellm: ghcr.io/berriai/litellm의 stable tag. 포트 4000. config.yaml을 volume mount, .env에서 key 주입.
- db: postgres 16. virtual key·spend tracking에 필요하다. DATABASE_URL로 litellm에 연결.

.env.example에 넣을 변수는 OPENAI_API_KEY, GEMINI_API_KEY, LITELLM_MASTER_KEY, LITELLM_SALT_KEY, POSTGRES_PASSWORD다. 실제 값은 커밋하지 않는다(.gitignore에 .env).

config.yaml의 뼈대는 아래와 같다. 모델 이름은 구현 시점에 docs.litellm.ai와 각 provider 문서에서 최신 안정 모델을 확인해 채운다.

```yaml
model_list:
  - model_name: gpt          # 사용자가 부르는 별칭
    litellm_params:
      model: openai/<최신 안정 모델>
      api_key: os.environ/OPENAI_API_KEY
  - model_name: gemini
    litellm_params:
      model: gemini/<최신 안정 모델>
      api_key: os.environ/GEMINI_API_KEY

router_settings:
  fallbacks: [{"gpt": ["gemini"]}]

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
```

검증 명령은 문서마다 반복되므로 형태를 통일한다. 예: 라우팅 검증.

```bash
curl -s http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt", "messages": [{"role": "user", "content": "ping"}]}'
```

## Track B: 폐쇄망 Terraform 사양

위치는 terraform/. [.claude/rules/terraform.md](../../../../.claude/rules/terraform.md)를 따르되, 이 실습은 사용자가 명시적으로 새 VPC를 요청했으므로 default VPC 규칙의 예외다. 설계 근거는 [adr/2026-07-closed-private-subnet-design.md](../adr/2026-07-closed-private-subnet-design.md)에 있다.

핵심 제약: private subnet은 IGW·NAT gateway가 전혀 없는 완전 폐쇄 영역이다. 인터넷이 안 되는 엔터프라이즈 조건을 재현하는 것이 목적이므로, 운영·개발에 필요한 통신은 전부 VPC endpoint로만 해결한다.

### VPC

- terraform-aws-modules/vpc/aws 모듈 사용. 버전은 웹 검색으로 최신 안정 버전 확인.
- private subnet만 생성(2개 AZ 권장, 최소 1개). enable_nat_gateway = false, public subnet 없음.
- DNS support·hostnames 활성화(interface endpoint의 private DNS에 필요).

### VPC endpoints

| endpoint | 타입 | 용도 |
|---|---|---|
| com.amazonaws.ap-northeast-2.ssm | Interface | SSM Session Manager |
| com.amazonaws.ap-northeast-2.ssmmessages | Interface | SSM 세션 채널 |
| com.amazonaws.ap-northeast-2.ec2messages | Interface | SSM agent 통신 |
| com.amazonaws.ap-northeast-2.s3 | Gateway | AL2023 dnf 저장소(S3 기반), ECR image layer |
| com.amazonaws.ap-northeast-2.ecr.api | Interface | ECR 인증·매니페스트 |
| com.amazonaws.ap-northeast-2.ecr.dkr | Interface | ECR docker pull |
| com.amazonaws.ap-northeast-2.bedrock-runtime | Interface | Bedrock 모델 호출 |

CloudWatch Logs·KMS endpoint는 선택으로 두고 기본은 만들지 않는다(비용). endpoint용 security group은 EC2 security group에서 오는 443만 허용한다.

### EC2

- AMI: AL2023 arm64 표준 AMI (al2023-ami-*-kernel-6.1-arm64, data 소스로 조회). Bedrock은 API 서비스라 전용 AMI가 없고 필요하지도 않다. Deep Learning AMI는 GPU 로컬 추론용이라 이 실습과 무관하다. AL2023의 dnf 저장소는 리전 내 S3로 서비스되므로 S3 gateway endpoint만 있으면 폐쇄망에서도 docker 패키지 설치가 된다 — 이것이 AL2023을 추천하는 실질적 이유다.
- 인스턴스: t4g.medium (사용자 지정), EBS 30GB gp3 암호화, private subnet 배치, public IP 없음.
- 접속: SSM Session Manager 전용. key pair·port 22 없음.
- user_data로 docker 설치(dnf install docker)까지만 하고, LiteLLM 기동은 학습자가 SSM 세션에서 직접 한다(학습 목적).

### IAM

EC2 instance role에 세 가지를 붙인다.

1. AmazonSSMManagedInstanceCore (SSM 접속)
2. ECR pull 권한 (ecr:GetAuthorizationToken, ecr:BatchGetImage, ecr:GetDownloadUrlForLayer — 대상 repository로 좁힘)
3. bedrock:InvokeModel, bedrock:InvokeModelWithResponseStream — 실습에 쓸 모델(또는 inference profile) ARN으로 좁힘

### 컨테이너 이미지 공급

폐쇄망 EC2는 ghcr.io에 못 나간다. 로컬(인터넷 가능)에서 이미지를 받아 private ECR에 push하고, EC2는 ECR endpoint로 pull한다. 절차는 docs/5에 포함한다.

```bash
docker pull ghcr.io/berriai/litellm:<stable-tag>
docker tag  ghcr.io/berriai/litellm:<stable-tag> <account>.dkr.ecr.ap-northeast-2.amazonaws.com/litellm:<stable-tag>
docker push <account>.dkr.ecr.ap-northeast-2.amazonaws.com/litellm:<stable-tag>
```

ECR repository도 terraform으로 만든다(litellm 하나, 필요하면 postgres도). arm64 이미지인지 확인하고 받는다(EC2가 Graviton).

### Bedrock 라우팅

- 사전 조건 두 가지를 docs/5 맨 앞에 명시한다: (1) 콘솔에서 Bedrock model access 활성화, (2) ap-northeast-2에서 쓸 모델 확인. Anthropic Claude 계열은 APAC cross-region inference profile(apac. 접두사)이 필요할 수 있으니 구현 시점에 확인한다.
- EC2 안 config.yaml에는 bedrock/<model 또는 inference profile> 하나만 등록한다. api key가 아니라 instance role 자격증명을 쓰므로 key 주입이 없다 — 폐쇄망에서 장기 자격증명이 사라지는 것 자체가 학습 포인트다.
- 검증: EC2 SSM 세션 안에서 localhost:4000으로 Track A와 같은 curl. 추가로 curl -m 3 <https://google.com이> 실패하는 것을 보여 "인터넷이 정말 안 되는 상태에서 LLM 호출이 된다"를 증명한다.

## 검증 체크리스트

구현 세션이 완료 판정에 쓸 기준이다.

- [ ] docker compose up 후 /health/liveliness 응답
- [ ] 별칭 gpt·gemini 각각 호출 성공, fallback 동작 확인
- [ ] virtual key로 호출 성공, 권한 밖 모델 호출 시 거부
- [ ] RPM limit 초과 시 429, budget 소진 시 거부
- [ ] spend logs에서 key별 사용량 조회
- [ ] guardrail 1종 차단 동작
- [ ] terraform validate·plan 통과 (apply는 비용이 드니 사용자 지시가 있을 때만)
- [ ] docs 5편이 markdown 규칙(H1 1개, 코드블록 위 설명) 준수

## 구현 시 따라야 할 규칙

- [.claude/rules/terraform.md](../../../../.claude/rules/terraform.md) — provider 버전 웹 검색, default_tags, SSM 접속 패턴
- [.claude/rules/markdown.md](../../../../.claude/rules/markdown.md) — 헤더·코드블록 규칙
- [.claude/rules/workflow.md](../../../../.claude/rules/workflow.md) — commit·push·PR·Issue는 사용자 명시 지시 전까지 금지
- [knowledge/playbooks/add-new-hands-on.md](../../../../knowledge/playbooks/add-new-hands-on.md) — 루트 README 목차 추가 등 핸즈온 표준 절차

## 작업 순서

1. docker/ 작성 → compose 기동 → docs/1·2 작성과 검증
2. docs/3·4 작성 (virtual key, rate limit, spend, guardrail 실험은 compose 환경에서 수행)
3. terraform/ 작성 → validate·plan → docs/5 작성 (apply는 사용자 지시 시)
4. README.md 허브 작성, 루트 README 목차 추가
5. AGENTS.md의 구조·제약 절 갱신, adr/에 새 결정 추가
6. PR 직전 knowledge/ 기록 검토 ([.claude/rules/knowledge.md](../../../../.claude/rules/knowledge.md))

## PR 직전 knowledge 기록 후보

- Topic: "AI gateway가 엔터프라이즈 AI 도입의 첫 관문인 이유" — 요구 기능 6가지와 LiteLLM 매핑
- Decision: 폐쇄망 실습에서 SaaS LLM 대신 Bedrock을 쓰는 이유 (workspace adr을 승격)
- 구현 중 확인한 LiteLLM OSS/enterprise 경계가 예상과 다르면 그 결과
