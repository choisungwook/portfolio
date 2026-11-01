# 실습 환경 구축 및 정리 (Setup & Teardown)

## 실습 환경 구성 개요

본 핸즈온은 AWS 클라우드 인프라와 로컬 Docker 기반의 Grafana 모니터링 컨테이너 1개를 함께 활용합니다.

IaC 도구인 Terraform은 VPC, 서브넷, NAT Gateway, 테스트용 EC2 등 방화벽이 배치될 기본 인프라 자리까지만 프로비저닝합니다. 방화벽 본체와 정책, 룰 그룹 및 실제 라우팅 전환은 실제 운영 서비스 도입 절차를 체감할 수 있도록 AWS 콘솔에서 단계별로 직접 수행합니다.

| 프로비저닝 대상 리소스 | 세부 설정 및 역할 |
| --- | --- |
| **VPC (`nfw-lab`)** | `10.0.0.0/16`, 다중 가용 영역 (`ap-northeast-2a`, `ap-northeast-2c`) |
| **Public Subnet** | `10.0.0.0/24`(a), `10.0.1.0/24`(c). 라우팅 테이블 `nfw-lab-public` 바인딩 |
| **Firewall Subnet** | `10.0.10.0/28`(a), `10.0.10.16/28`(c). 라우팅 테이블 `nfw-lab-firewall` (`0.0.0.0/0 → NAT Gateway`) |
| **App Subnet** | `10.0.20.0/24`(a), `10.0.21.0/24`(c). 라우팅 테이블 `nfw-lab-app-*` (`0.0.0.0/0 → NAT Gateway`) |
| **NAT Gateway** | AZ a에 1개 프로비저닝 (단일 NAT 구성) |
| **EC2 인스턴스** | 가용 영역별 1대씩 총 2대 (`nfw-lab-app-ap-northeast-2a`, `-2c`). t4g.medium, SSM 접속 지원 |
| **CloudWatch Log Group** | `/aws/network-firewall/nfw-lab/alert`, `/flow` (보존 기간 1일) |

EC2 인스턴스 내부에는 `egress-probe` 시스템 데몬이 사전에 등록되어 있습니다. 2초마다 `https://checkip.amazonaws.com`과 `https://www.google.com`을 연속 호출하며 HTTP 상태 코드를 실시간으로 기록하므로, 운영 중인 서비스 트래픽의 역할을 시뮬레이션합니다.

---

## 사전 준비물

실습을 원활히 진행하기 위해 로컬 환경에 아래 도구들이 준비되어 있어야 합니다.

- **Terraform**: 1.11 이상
- **AWS CLI** 및 **Session Manager Plugin** (EC2 콘솔 SSM 연결 및 CLI 명령 실행용)
- **Docker** 및 **Docker Compose** (로컬 Grafana 구동용)
- **jq** (대체 CLI 명령어 실행 시 Terraform JSON 출력 파싱용)
- **AWS 자격 증명**: 서울 리전(ap-northeast-2)에 리소스를 생성할 수 있는 권한. 터미널 셸 환경변수에 프로파일을 export하여 사용합니다.

터미널 환경에서 실습에 사용할 AWS 프로파일을 지정합니다.

```bash
export AWS_PROFILE=<본인의_AWS_프로파일_이름>
```

---

## Up

명령어는 본 실습 workspace 디렉터리에서 실행합니다.

실습 디렉터리로 이동합니다.

```bash
cd aws/network-firewall/egress-filtering
```

Terraform 인프라 프로비저닝과 로컬 Grafana 컨테이너 기동을 동시에 실행합니다. (약 2분 소요)

```bash
terraform -chdir=terraform init && terraform -chdir=terraform apply -auto-approve && docker compose up -d
```

### 생성 후 점검 사항

- 웹 브라우저에서 `http://localhost:3000`에 접속하여 Grafana가 로그인 화면 없이 정상 열리는지 확인합니다.
- Grafana 컨테이너는 호스트의 `~/.aws`를 읽기 전용으로 마운트하고 export된 `AWS_PROFILE`을 통해 CloudWatch를 조회합니다. (AWS IAM Identity Center / SSO 로그인을 사용하는 경우 로컬 세션 토큰이 유효해야 합니다.)
- Linux Docker 환경에서 CloudWatch 연동 실패 시 [troubleshooting.md](./troubleshooting.md#linux-docker에서-grafana가-cloudwatch를-읽지-못하는-경우)를 참고하십시오.

---

## Down

실습이 끝난 후 과금을 방지하기 위해 모든 리소스를 완전히 정리합니다.

AWS 콘솔에서 수동 생성한 방화벽, 정책, 룰 그룹은 Terraform 관리 대상이 아닙니다. 특히 **방화벽 엔드포인트(`vpce-`)가 서브넷에 남아 있거나 라우팅 테이블이 엔드포인트를 가리키고 있으면 `terraform destroy`가 서브넷 삭제 단계에서 실패**하므로, 반드시 아래 순서대로 콘솔 리소스를 먼저 정리한 뒤 Terraform을 삭제해야 합니다. (약 6분 소요)

### 1단계: 라우팅 테이블 원복

[시나리오 2의 8단계](./2-traffic-inspection.md#8단계-비상-롤백rollback-절차)에 따라 라우팅 테이블을 원래대로 원복합니다.

- `nfw-lab-app-ap-northeast-2a`, `-2c` 라우팅 테이블의 `0.0.0.0/0` 타깃을 기존 **NAT Gateway**로 변경합니다.
- `nfw-lab-public` 라우팅 테이블에서 추가했던 `10.0.20.0/24` 및 `10.0.21.0/24` 엔드포인트 라우팅을 삭제합니다.

### 2단계: 방화벽 로깅 해제 및 방화벽 삭제

1. **VPC > Network Firewall > Firewalls > nfw-lab**을 선택합니다.
2. **Firewall details > Logging > Edit**를 클릭하고 Alert 및 Flow 체크를 모두 해제한 뒤 저장합니다.
3. 방화벽 목록에서 `nfw-lab`을 선택하고 **Delete**를 클릭합니다.
4. 방화벽 리소스와 엔드포인트가 목록에서 완전히 사라질 때까지 대기합니다. (통상 약 4분 소요)

### 3단계: 방화벽 정책 및 룰 그룹 삭제

1. **Firewall policies** 콘솔에서 `nfw-lab-policy`를 삭제합니다.
2. **Network Firewall rule groups** 콘솔에서 `nfw-lab-egress-allow`를 삭제합니다.
   > [!NOTE]
   > 만약 `still in use` 오류가 발생하면 정책 삭제 작업이 백엔드에서 완료되는 중이므로 약 1분 후 다시 삭제를 시도합니다.

### 4단계: 기본 인프라 및 Docker 컨테이너 제거

콘솔 리소스 정리가 완료되면 터미널에서 Terraform 인프라와 로컬 Grafana 컨테이너를 일괄 제거합니다.

Terraform 리소스 37개 삭제 및 Grafana 컨테이너/볼륨을 완전히 제거합니다.

```bash
terraform -chdir=terraform destroy -auto-approve && docker compose down -v
```
