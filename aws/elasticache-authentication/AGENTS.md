# ElastiCache 인증 핸즈온 — agent 맥락

이 파일은 이 핸즈온(`aws/elasticache-authentication`)을 수정하는 agent를 위한 맥락이다. 저장소 전체 규칙은 루트 [AGENTS.md](../../AGENTS.md)를 따른다.

## 목적

TLS만 켜진 ElastiCache Valkey에 인증을 무중단으로 추가하는 실습이다. 무인증 → AUTH token → RBAC → IAM 전용으로 단계마다 강화하되, 현재 트래픽을 받는 앱의 Redis 오류를 0건으로 유지한다.

## 구조

- `apps/{noauth,auth,iam}` — 인증 방식별 독립 Spring Boot 앱. cache 코드는 세 앱에 의도적으로 복제한다. iam 앱만 SigV4 provider와 AWS SDK를 갖는다.
- `Makefile` — Docker Hub 단일 repo `choisunguk/elasticache-auth-client`, tag는 `<stage>-<version>`. buildx multi-arch push.
- `terraform/` — EC2 앱 호스트(SSM 접속)와 Valkey. `migration_phase`로 인증 단계를 제어한다.
- `docs/1~5` — 실행 순서. `docs/6-console-runbook.md` — 4·5의 클러스터 변경을 콘솔·CLI로 옮긴 부록. `hurl/` — EC2 안에서 도는 cache gate.

## ADR (결정 - 이유)

- 결정: 앱을 noauth/auth/iam 세 개로 분리한다. / 이유: 단계별 클라이언트 코드 차이를 이미지로 드러낸다. 중복보다 명료성을 우선한다.
- 결정: EC2 안 Docker 컨테이너로 pod을 대체하고 SSM port-forward를 없앤다. / 이유: 같은 VPC에서 실 endpoint로 직접 TLS 연결하므로 hosts 수정이 사라지고 hurl 검증도 EC2 안에서 끝난다.
- 결정: AUTH token에서 RBAC로 넘어갈 때 `default` user(password=기존 token)를 다리로 쓴다. / 이유: 전환 순간에도 `AUTH <token>` 클라이언트가 default user로 인증되어 무중단을 유지한다.
- 결정: in-place 전환이 연결을 끊으면 새 클러스터 blue-green으로 옮긴다. / 이유: user group 부착이 기존 연결을 종료할 수 있어 무중단이 항상 보장되지 않는다.
- 결정: IAM 토큰 서명 자격증명을 EC2 instance role로 공급하고 IMDSv2 hop limit을 2로 둔다. / 이유: Docker bridge의 컨테이너가 IMDS에 닿으려면 hop이 2여야 하고, 로컬 AWS profile 의존을 없앤다.

## agent가 알아야 할 제약 (검증됨)

- `migration_phase` 순서: `unauthenticated` → `auth_overlap`(ROTATE) → `auth_required`(SET) → `rbac_overlap`(DELETE + user group[default, iam]) → `iam_required`(user group[iam]). 단계를 건너뛰면 기존 연결이 끊긴다.
- Terraform provider는 6.31.0 이상이어야 한다. `DELETE` + `user_group_ids` 추가 조합 버그가 그 버전에서 고쳐졌다. 현재 pin은 `~> 6.54`.
- 엔진 버전 제약: RBAC은 Redis 6.0+ / Valkey 7.2+, IAM은 Redis 7.0+ / Valkey 7.2+. Redis 5.0.6 미만은 실행 중 AUTH token을 못 켜서 새 클러스터가 유일한 길이다. 이 실습은 Valkey를 쓴다.
- Valkey user group은 default user 필수 요건이 없어 IAM user만 남긴 IAM 전용 상태가 유효하다.
- IAM 인증: token 15분 유효, 연결은 12시간 뒤 끊겨 재연결마다 새 token이 필요하다(provider가 공급), user_id와 user_name이 같아야 하고, TLS와 `elasticache:Connect` 권한이 필요하다.
- 이미지를 다시 push할 때는 `Makefile`의 `VERSION`을 올린다. 같은 tag를 덮어쓰지 않는다.

## 수정 시 주의

- 세 앱의 공통 cache 코드를 바꾸면 세 곳을 모두 바꾼다(의도적 복제).
- 문서의 `docker run` 예시는 동적 값(endpoint, token, host port)만 env로 주입하는 형태를 유지한다.
- 인증 단계를 추가하면 `terraform/variables.tf`의 `migration_phase` validation, `terraform/elasticache.tf`의 locals 맵, docs의 단계 표를 함께 갱신한다.
