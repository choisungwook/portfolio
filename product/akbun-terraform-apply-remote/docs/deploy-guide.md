# 배포 가이드

AWS에 서버를 배포하는 Terraform 코드(deploy/ec2, deploy/ecs)의 사용법과, 배포 중 작업이 끊기지 않는 이유를 정리한다. 기본 사용법은 [user-guide.md](./user-guide.md)를 먼저 본다.

## 배포가 안전한 이유 (takeover 구조)

서버는 재배포를 전제로 설계했다.

- **graceful drain**: SIGTERM을 받으면 새 webhook 수신을 멈추고, 진행 중인 terraform plan/apply를 끝까지 마친 뒤 종료한다(최대 30분 대기). apply가 중간에 잘리는 최악의 상황을 배포가 만들지 않는다.
- **상태 영속화**: 프로젝트 lock과 plan 기록(어느 commit에서 plan했는지)을 이벤트 처리 때마다 데이터 디렉터리의 state.json에 저장한다. 새 인스턴스는 기동 시 이 파일을 읽어 이전 인스턴스의 상태를 그대로 이어받는다. PR checkout과 저장된 plan 파일도 같은 디렉터리에 있으므로, 배포 전에 plan한 것을 배포 후에 apply할 수 있다.
- **self-deploy**: EC2 배포는 새 바이너리를, ECS 배포는 새 이미지 태그를 감지해 스스로 교체한다. 아래 각 절에서 설명한다.

## 공통 준비

- GitHub token(대상 저장소 Contents read, Issues/PR write)과 webhook secret을 준비한다.
- 두 스택 모두 secret을 SSM SecureString 파라미터로 만들어 전달하므로 코드나 user data에 평문이 남지 않는다.
- 두 스택은 PAT 방식(`ATR_GITHUB_TOKEN`)을 기본으로 배선한다. GitHub App 임시 토큰 방식을 쓰려면 [user-guide.md](./user-guide.md)의 인증 옵션 절을 따라 `ATR_GITHUB_APP_*` 환경변수와 private key 파일을 대신 주입한다(EC2는 env 파일, ECS는 task definition 수정).
- 서버 안의 terraform이 AWS 리소스를 만들 때 쓰는 권한은 실습 기준 PowerUserAccess를 붙인다. 운영에서는 관리 대상에 맞게 좁힌다.

## EC2 배포 (deploy/ec2)

Graviton t4g.small 한 대에 systemd 서비스로 올리는 가장 저렴한 구성이다. default VPC를 쓰고, SSH 대신 SSM Session Manager로 접속한다.

빌드 파이프라인이 올린 linux 바이너리를 아무 URL(S3 presigned 제외, 고정 URL 권장)에 올린 뒤 적용한다.

```bash
cd deploy/ec2
terraform init
terraform apply \
  -var binary_url=https://<바이너리 URL> \
  -var webhook_secret=<secret> \
  -var github_token=<token>
```

출력된 webhook_url을 GitHub 저장소 webhook에 등록한다(Issue comments + Pull requests 이벤트, secret 동일하게).

동작 구조:

- user data가 terraform과 서버 바이너리를 설치하고 systemd 서비스(atr.service)로 띄운다. 서비스는 기동 시 SSM에서 secret을 읽어 환경변수로 주입한다.
- **self-deploy**: atr-update.timer가 5분마다 binary_url을 받아 현재 바이너리와 비교하고, 바뀌었으면 교체 후 systemctl restart를 한다. systemd의 TimeoutStopSec이 30분이라 restart도 drain을 기다린다. 즉 binary_url에 새 바이너리를 올리는 것이 곧 배포다.
- 상태는 인스턴스의 /opt/atr/data에 남는다. 재시작과 재배포에는 안전하지만 인스턴스를 교체하면 사라진다. 교체 후에는 PR에서 plan을 다시 실행한다.
- webhook은 HTTP(포트 4141)로 받는다. HMAC 서명 검증이 인증을 담당하지만, TLS까지 원하면 ECS 배포(ALB + ACM)를 쓴다.

## ECS 배포 (deploy/ecs)

Fargate(ARM64) + ALB(HTTPS) + EFS 구성이다. HA 인수인계까지 필요하면 이쪽을 쓴다.

이미지를 먼저 빌드해 ECR에 올린다.

```bash
docker buildx build --platform linux/arm64 -t <account>.dkr.ecr.ap-northeast-2.amazonaws.com/atr:v1 --push .
```

ACM 인증서(콘솔에서 미리 발급)와 함께 적용한다.

```bash
cd deploy/ecs
terraform init
terraform apply \
  -var image=<ECR 이미지 URI> \
  -var acm_certificate_arn=<인증서 ARN> \
  -var route53_zone_id=<zone id, 선택> \
  -var domain_name=<도메인, 선택> \
  -var webhook_secret=<secret> \
  -var github_token=<token>
```

동작 구조:

- **takeover**: state.json, PR checkout, plan 파일이 모두 EFS(/data)에 있다. 배포 시 ECS가 새 task를 먼저 띄우고(healthy 확인) 이전 task를 내리는 rolling 교체를 하므로 다운타임이 없고, 새 task는 EFS에서 이전 상태를 이어받는다. 이전 task는 ALB에서 빠져 새 webhook을 받지 않는 상태로 진행 중인 실행을 마친다.
- **self-deploy**: 새 이미지 태그를 push하고 image 변수만 바꿔 terraform apply하면 위의 rolling 교체가 일어난다.
- **제약**: Fargate의 stopTimeout 상한이 120초라 SIGTERM 후 2분을 넘기는 apply는 잘릴 수 있다. 대신 상태가 EFS에 있으므로 새 task에서 plan을 다시 실행하면 된다. 2분 이상 걸리는 apply가 흔하면 EC2 배포를 권한다.
- secret은 task definition의 secrets 필드로 SSM 파라미터 ARN만 참조하고, ECS가 기동 시 주입한다.

## 두 구성 비교

| | EC2 | ECS |
|---|---|---|
| 비용 | t4g.small 한 대 | Fargate + ALB + EFS |
| TLS | 없음(HMAC만) | ALB + ACM |
| 배포 방식 | binary_url 교체를 timer가 감지 | 이미지 태그 교체 후 apply |
| drain 시간 | 최대 30분 | 최대 120초 (Fargate 상한) |
| 인스턴스 교체 시 상태 | 사라짐 (재plan 필요) | EFS에 유지 |
