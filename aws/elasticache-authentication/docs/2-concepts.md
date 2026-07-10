# 인증 개념과 전환 제약

TL;DR: ElastiCache 인증은 AUTH token, RBAC, IAM 세 가지다. AUTH token은 클러스터 공용 password, RBAC는 사용자 단위 권한, IAM은 AWS 자격증명으로 만든 임시 token이다. RBAC는 Redis 6+, IAM은 Redis 7+가 필요하고, 무중단 전환의 핵심은 전환 순간에도 인증되는 다리를 두는 것이다.

이 실습의 독자는 ElastiCache의 전송 중 암호화(TLS)는 설정해 봤지만 인증은 처음이라고 가정한다.

## AUTH token

AUTH token은 클러스터 하나에 공용 password를 거는 방식이다. 클라이언트는 연결 후 `AUTH <token>`을 보내고, 사용자 이름은 없다. 이때 Redis는 `default` 사용자로 인증한 것으로 본다. TLS가 켜져 있어야 한다.

이미 떠 있는 클러스터에 token을 넣거나 바꿀 때는 두 전략을 쓴다.

- `ROTATE`: 새 token을 추가하되 이전 token(또는 무인증)도 함께 허용한다. 호환 구간을 만든다.
- `SET`: token을 하나만 남겨 인증을 강제한다. `ROTATE`를 거친 클러스터에서만 쓸 수 있다.

무인증 클러스터에 `ROTATE`를 적용하면 새 token과 무인증 연결이 함께 허용되고, 이어서 `SET`을 적용하면 무인증이 막힌다. 이 두 단계로 기존 앱을 끊지 않고 인증을 켠다.

### token을 바꿔도 기존 연결은 끊기지 않는다

`AUTH`는 연결을 맺을 때 한 번만 검사한다. 인증을 통과한 연결에는 명령마다 다시 묻지 않고, ElastiCache가 token을 바꿔도 이미 맺힌 연결을 끊지 않는다. `SET` 적용 중에도 인증 앱의 요청이 끊기지 않는 것은 이 성질 덕분이다.

같은 성질이 무인증 앱에도 적용된다. `SET` 이전에 열린 무인증 연결은 `SET` 이후에도 살아 있어 cache 요청이 계속 성공한다. `NOAUTH`는 컨테이너 재시작, TCP 재연결, 노드 교체처럼 **새 연결을 열 때**부터 난다. 그래서 무인증 앱을 남긴 채 `SET`을 적용하면 오류가 보이지 않지만, 그 앱은 다음 재연결에서 끊긴다.

여기서 실습 절차 두 가지가 따라 나온다. `SET` 전에 무인증 컨테이너를 먼저 내려야 하고, 무인증이 실제로 막혔는지는 살아 있던 연결이 아니라 새로 띄운 컨테이너로 확인해야 한다.

## RBAC

RBAC(Role-Based Access Control)는 클러스터 공용 password 대신 사용자를 만들고 사용자마다 권한을 준다. 구성 요소는 셋이다.

- user: 인증 방식(password 또는 iam)과 접근 권한을 가진 계정. user ID와 user name이 있다.
- user group: user들의 묶음. 클러스터에는 user group을 붙인다.
- access string: 권한 규칙. 예: `on ~* +@all`은 활성 사용자에게 모든 키·명령을 허용한다. `off`면 비활성이다.

`AUTH <token>`처럼 사용자 이름 없이 접속하는 클라이언트는 user name이 `default`인 user로 인증된다. 그래서 RBAC로 넘어가도 `default` user를 password 방식으로 두고 그 password를 기존 AUTH token과 같게 하면, 기존 클라이언트가 코드 변경 없이 계속 붙는다. 이것이 무중단 전환의 다리다.

Valkey engine의 user group은 default user가 반드시 있어야 하는 제약이 없다. user group에 IAM user만 남겨 IAM 전용 상태를 만들 수 있다.

## IAM 인증

IAM 인증은 장기 password를 두지 않고, AWS 자격증명으로 서명한 임시 token으로 접속한다. 클라이언트는 `AUTH <user> <token>` 형태로 사용자 이름과 token을 함께 보낸다.

- IAM user는 user ID와 user name이 같아야 한다.
- token은 SigV4 서명이며 15분간 유효하다. 연결마다 새로 만든다.
- 연결은 12시간 뒤 끊기므로, 클라이언트는 재연결 때 새 token을 공급해야 한다. 이 실습의 iam 앱은 Lettuce의 credentials provider로 매 연결마다 token을 만든다.
- 접속 주체(EC2 instance role 등)에 `elasticache:Connect` 권한이 있어야 한다.

장점은 장기 password 제거와 role 단위 권한 분리다. 단점은 token 생성·재연결·IAM 장애까지 운영 범위가 넓어지는 것이다.

## 버전별 적용 제약

같은 ElastiCache라도 엔진 버전에 따라 쓸 수 있는 인증이 다르다.

| 기능 | 최소 엔진 버전 |
| --- | --- |
| AUTH token 사용 | Redis 3.2.6+ / 4.0.10+ (TLS 필요) |
| AUTH token in-place 수정(`ROTATE`/`SET`) | Redis 5.0.6+ 또는 Valkey 7.2+ |
| RBAC (user group) | Redis 6.0+ 또는 Valkey 7.2+ |
| IAM 인증 | Redis 7.0+ 또는 Valkey 7.2+ |

주의할 점은 두 가지다.

- Redis 6은 RBAC까지만 되고 IAM 인증은 안 된다. IAM까지 가려면 Redis 7+ 또는 Valkey여야 한다.
- Redis 5.0.6 미만은 실행 중인 클러스터에 AUTH token을 in-place로 켤 수 없다. 이 경우 무중단 전환이 불가능하므로 인증이 켜진 클러스터를 새로 만들어 옮겨야 한다.

이 실습은 Valkey를 쓰므로 네 방식이 모두 가능하다.

## 무중단 전환: in-place vs 새 클러스터

AUTH token에서 RBAC로 넘어가는 한 번의 변경이 이 실습에서 가장 위험한 지점이다. 두 가지 길이 있다.

in-place는 같은 클러스터에서 `modify-replication-group --auth-token-update-strategy DELETE --user-group-ids-to-add <group>` 한 번으로 token을 지우고 user group을 붙인다. `default` user password를 기존 token과 같게 두면 전환 순간에도 `AUTH <token>` 클라이언트가 계속 인증된다. 이 실습은 이 길을 택한다. 단, user group을 붙이거나 user를 group에서 빼면 해당 연결이 종료될 수 있고(문서상 existing connections are terminated), Lettuce가 재연결하는 짧은 순간이 무중단 기준을 깰 수 있다. Terraform은 이 조합(DELETE + user group 추가)에서 나던 오류를 AWS provider 6.31.0에서 고쳤으므로 최신 provider를 쓴다.

새 클러스터(blue-green)는 처음부터 RBAC로 만든 클러스터에 클라이언트를 cutover하고 기존 클러스터를 폐기한다. 기존 클러스터를 건드리지 않으므로 전환 순간의 연결 종료 위험이 없다. 대신 endpoint가 바뀌므로 앱 설정이나 DNS 전환이 필요하고, 두 클러스터를 동시에 운영하는 비용과 데이터 동기화(또는 cache 특성상 재적재)를 감수해야 한다. in-place 전환 중 현재 컨테이너의 Hurl gate가 끝나면 이 길로 돌아선다. 절차는 [5-rbac-iam.md](./5-rbac-iam.md) 끝에 있다.

참고: [AWS AUTH](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/auth.html), [RBAC](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Clusters.RBAC.html), [IAM 인증](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/auth-iam.html)
