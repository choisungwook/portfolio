# runtime 설정 파일

- 위치: workspace 루트의 `runtime/`. 절대 경로는 `<workspace>/runtime/config.json`처럼 workspace 경로 뒤에 붙어요.
- `runtime/`은 `.gitignore`에 있어요. 실제 계정 번호·EIP·리소스 ID가 들어가므로 커밋하지 않고, git status와 에디터 트리에도 보이지 않아요.
- 예제는 [examples/](../examples/)에 자리표시 값으로 있어요. 계정은 `123456789012`, 공인 IP는 문서용 대역 `203.0.113.0/24`예요.
- 파일은 Terraform output을 `jq .`로 정렬해 만들어요. 손으로 편집하지 않고, apply 뒤마다 다시 생성해요.

| 파일 | 만드는 명령 | 읽는 코드 | 예제 |
| --- | --- | --- | --- |
| `runtime/config.json` | `terraform -chdir=terraform output -json client_config \| jq .` | `scenarios/s01_public_dns_sts.py`, `scenarios/s06_own_domain_tls_nlb.py`, `scripts/public_nlb_hosts.py` | [config.json.example](../examples/config.json.example) |
| `runtime/hosts.entries` | `python -m scripts.public_nlb_hosts runtime/config.json --az <AZ>` | 사람이 `/etc/hosts`에 붙여 넣음 | [hosts.entries.example](../examples/hosts.entries.example) |
| `proxy/squid.conf` | 저장소에 포함 (git 추적) | S02 Squid 컨테이너 | 그대로 사용 |
| `runtime/s07.json` | `terraform -chdir=terraform/labs/s07 output -json lab \| jq .` | `scenarios/s07_public_proxy_sts.py` (`LAB_CONFIG`) | [s07.json.example](../examples/s07.json.example) |

## config.json (S01·S06)

| 항목 | 의미 | 코드가 쓰는 곳 |
| --- | --- | --- |
| `region` | 실습 리전. `ap-northeast-2`가 아니면 코드가 중단 | STS·Memory URL과 SigV4 서명 리전 |
| `role_arn` | Terraform이 만든 client Role | `AssumeRole` 대상 |
| `memory_id` | Terraform이 만든 AgentCore Memory ID | CreateEvent·GetEvent·DeleteEvent |
| `source_principal_arn` | `trusted_principal_arn` 입력값. 클라이언트 프로파일의 주체 | 참고용. 코드는 `AWS_PROFILE`로 시작 |
| `services.<svc>.hostname` | 유지해야 하는 AWS 이름 | DNS·TLS 검사의 이름, SNI, Host |
| `services.<svc>.eips` | AZ → NLB EIP. 방화벽 허용 목록과 hosts에 쓰는 값 | `--az`로 하나를 골라 DNS·TLS peer 검사 |
| `services.<svc>.nlb_dns_name` | NLB 자체 DNS 이름. 코드는 쓰지 않음 | 콘솔 대조용 |
| `services.<svc>.target_group_arn` | target health 조회용 | `aws elbv2 describe-target-health` |
| `services.<svc>.vpc_endpoint_id` | interface endpoint ID | endpoint policy 확인, Memory Role의 `aws:SourceVpce` |
| `services.<svc>.own_domain_url` | S06 자체 도메인 URL. S06을 끄면 `null` | S06의 boto3 `endpoint_url`. null이면 S06 코드가 시작 전에 중단 |
| `services.<svc>.tls_eips` | AZ → S06 TLS NLB EIP. S06을 끄면 빈 객체 | 방화벽 허용 목록, 다른 DNS 사업자에 A 레코드를 직접 넣을 때 |
| `services.<svc>.tls_target_group_arn` | S06 TLS target group. S06을 끄면 `null` | `aws elbv2 describe-target-health` |

- `<svc>`는 `sts`와 `memory` 두 개예요.
- S06 항목은 `acm_certificate_arn`과 `tls_alias_domains`를 함께 넣고 apply했을 때만 값이 채워져요.
- AZ를 늘리면 `eips`에 AZ 항목이 늘어요. 한 번 실행에 AZ 하나만 골라요.

## hosts.entries (S01)

- 형식은 `<EIP> <AWS 이름>` 두 줄이에요. `/etc/hosts`의 실습 블록 안에 그대로 붙여 넣어요.
- 절차는 [로컬 /etc/hosts 설정과 원복](6-hosts-setup.md)에 있어요.

## s07.json (S07)

| 항목 | 의미 | 코드가 쓰는 곳 |
| --- | --- | --- |
| `region`, `role_arn`, `memory_id` | S01과 같음 | 같음 |
| `proxy_url` | 자체 도메인의 HTTPS CONNECT 프록시 주소 | boto3 `proxies={"https": ...}` |
| `proxy.addresses` | AZ → public NLB EIP. 방화벽 허용 목록 | 참고용 |
| `proxy.target_group_arn`, `proxy.instance_id` | 프록시 target health·EC2 확인용 | 관리 명령 |
| `services.<svc>.hostname` | 터널 안에서 유지하는 AWS 이름 | boto3 `endpoint_url` |
| `services.<svc>.endpoint_url` | VPCE 전용 DNS. 프록시 EC2가 서버 쪽 연결에 사용 | 클라이언트 코드는 쓰지 않음 |
| `services.<svc>.private_ips` | AZ → endpoint ENI 사설 IP | 참고용 |

- S07 클라이언트는 hosts를 바꾸지 않아요. 자체 도메인만 기존 DNS로 조회돼요.

## 그림 파일

- `imgs/*.png`는 문서에 붙이는 렌더링 결과, `imgs/*.mmd`는 그 Mermaid 원본이에요.
- 원본을 고친 뒤 다시 렌더링해요. Node가 있으면 별도 설치 없이 실행돼요.

```bash
npx -y -p @mermaid-js/mermaid-cli mmdc -i imgs/s07-architecture.mmd -o imgs/s07-architecture.png -b white -s 2
```
