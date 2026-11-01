# Setup

이 핸즈온은 AWS 리소스와 로컬 Grafana 컨테이너 1개를 사용합니다. Terraform은 firewall이 들어갈 자리까지만 만들고, firewall, policy, rule group은 실습에서 콘솔로 만듭니다.

| Terraform이 만드는 것 | 설정 |
| --- | --- |
| VPC `nfw-lab` | `10.0.0.0/16`, AZ `ap-northeast-2a`, `ap-northeast-2c` |
| public subnet | `10.0.0.0/24`(a), `10.0.1.0/24`(c). route table `nfw-lab-public` 1개 |
| firewall subnet | `10.0.10.0/28`(a), `10.0.10.16/28`(c). route table `nfw-lab-firewall`: `0.0.0.0/0 → NAT` |
| app subnet | `10.0.20.0/24`(a), `10.0.21.0/24`(c). route table `nfw-lab-app-ap-northeast-2a`, `nfw-lab-app-ap-northeast-2c`: `0.0.0.0/0 → NAT` |
| NAT gateway | AZ a에 1개 |
| EC2 | app subnet마다 1대(`nfw-lab-app-ap-northeast-2a`, `-2c`). t4g.medium, SSM으로 접속 |
| CloudWatch log group | `/aws/network-firewall/nfw-lab/alert`, `/aws/network-firewall/nfw-lab/flow`, 보존 1일 |

EC2에는 `egress-probe` 서비스가 돌고 있습니다. 2초마다 `https://checkip.amazonaws.com`과 `https://www.google.com`을 호출해 HTTP 코드를 한 줄로 남깁니다. 실습에서 운영 중인 서비스 역할을 합니다.

## 준비물

- Terraform 1.11 이상
- AWS CLI와 Session Manager plugin
- Docker
- ap-northeast-2에 리소스를 만들 수 있는 AWS 자격 증명. 이 문서의 명령은 shell에 export한 `AWS_PROFILE`을 사용합니다.

```bash
export AWS_PROFILE=<내 프로파일>
```

## Up

명령은 workspace 루트에서 실행하므로 저장소 루트에서 먼저 이동합니다.

```bash
cd aws/network-firewall/egress-filtering
```

AWS 리소스와 Grafana를 한 줄 명령으로 Provisioning하며, apply는 약 2분 걸립니다.

```bash
terraform -chdir=terraform init && terraform -chdir=terraform apply && docker compose up -d
```

- Grafana는 `http://localhost:3000`에 로그인 없이 열립니다.
- Grafana 컨테이너는 `~/.aws`를 읽기 전용으로 마운트하고 export한 `AWS_PROFILE`로 CloudWatch를 읽습니다. 프로파일이 SSO처럼 브라우저 로그인이 필요한 방식이면 컨테이너 안에서 인증하지 못할 수 있습니다.
- Linux Docker에서 CloudWatch를 읽지 못하면 [troubleshooting.md](./troubleshooting.md#linux-docker에서-grafana가-cloudwatch를-읽지-못한다)를 봅니다.

## Down

콘솔에서 만든 firewall, policy, rule group은 Terraform이 모릅니다. firewall endpoint가 firewall subnet에 남아 있으면 `terraform destroy`가 subnet을 지우지 못하므로 콘솔 리소스를 먼저 지웁니다. 실측 약 6분 걸립니다.

1. [시나리오 2의 8단계](./2-traffic-inspection.md#8-route-롤백-절차-약-2분)로 route를 되돌립니다. endpoint를 가리키는 route가 남아 있으면 firewall을 지울 수 없습니다.
2. **Firewalls > nfw-lab > Firewall details > Logging > Edit**에서 로깅을 모두 끄고 저장합니다.
3. **Firewalls**에서 `nfw-lab`을 고르고 **Delete**를 누릅니다.
   - firewall이 목록에서 사라질 때까지 기다리며, 실측 4분이 걸렸습니다.
4. **Firewall policies**에서 `nfw-lab-policy`를 지웁니다.
5. **Network Firewall rule groups**에서 `nfw-lab-egress-allow`를 지웁니다.
   - policy가 아직 지워지는 중이면 `still in use` 오류가 납니다. 1분쯤 뒤 다시 지웁니다.
6. workspace 루트에서 아래 명령으로 AWS 리소스와 Grafana를 지웁니다.

6단계의 명령이며, 실측에서 리소스 37개가 삭제되었습니다.

```bash
terraform -chdir=terraform destroy && docker compose down -v
```
