# 시나리오

- AWS와 온프레미스는 각각 private subnet에 있는 nginx에 접근하기 위해, Site to Site VPN을 구축합니다.
- AWS는 **VGW(Virtual Private Gateway)** 기반의 Site to Site VPN을 구축합니다. 온프레미스가 BGP를 지원하지 않아 **Static Routing**을 사용하고, 두 개의 터널은 **Active/Standby**로 동작합니다.
- 온프레미스는 AWS EC2인스턴스에서 실행되고 strongSwan을 설치하여 VPN 터널을 구성합니다. BGP가 없으므로 FRR은 설치하지 않습니다.

### TGW 대신 VGW를 사용하는 이유

- 온프레미스가 BGP를 지원하지 않아 Static Routing만 가능합니다.
- Static Routing에서는 TGW의 ECMP(Active/Active)를 활용할 수 없으므로, VGW의 Active/Standby가 적합합니다.
- VGW는 TGW보다 비용이 낮고, 단일 VPC 연결이면 구성도 단순합니다.

### Active/Standby 동작 방식

- VGW Static Routing에서는 두 개의 터널 중 하나만 Active로 트래픽을 처리합니다.
- Active 터널에 장애가 나면, Standby 터널이 Active로 전환됩니다.
- 이 전환은 DPD(Dead Peer Detection) 감지 후 자동으로 이루어집니다.

## 실습

- Terraform으로 AWS Cloud역할을 하는 VPC와 온프레미스 VPC를 생성합니다. 온프레미스 VPC에서는 VPN 역할을 하는 EC2인스턴스와 nginx역할을 하는 EC2인스턴스가 있습니다.
- Terraform으로 구축한 환경에서 AWS 콘솔에서 직접 VGW, Site to Site VPN을 구축합니다. 또한, EC2인스턴스 쉘에서 직접 strongSwan을 설치하여 VPN 터널을 구성합니다. BGP가 없으므로 FRR 설치는 불필요합니다.

- Cloud VPC: `10.10.0.0/16`
- Onprem VPC: `10.20.0.0/16`

### Step 1: 인프라 배포 (Terraform)

Terraform 스크립트가 VPC, EC2 등 기본 AWS 리소스를 자동으로 생성합니다. VGW와 VPN 연결은 이후 단계에서 AWS 콘솔로 직접 만듭니다.

1. `terraform` 디렉터리로 이동하여 `init`과 `apply`를 실행합니다.

```bash
cd terraform
terraform init -upgrade
terraform apply --auto-approve
```

2. `apply`가 완료되면, 이후 단계에 필요한 출력 값들을 확인합니다.

```bash
# 온프레미스 VPN 장비의 Public IP (Customer Gateway IP로 사용됨)
terraform output onprem_vpn_appliance_public_ip

# 각 EC2 인스턴스 접속용 SSM 명령어
terraform output
```

### Step 2: VGW(Virtual Private Gateway) 생성

1. AWS 콘솔에서 **VPC > Virtual Private Gateways**로 이동합니다.
2. **Create virtual private gateway** 버튼을 클릭합니다.
3. **Name tag**에 적절한 이름을 입력합니다 (예: `s2s-vpn-vgw`).
4. **ASN**은 `Amazon default ASN (64512)`을 선택합니다.
5. **Create** 버튼을 클릭합니다.

VGW가 생성되면 Cloud VPC에 attach합니다.

1. 생성된 VGW를 선택합니다.
2. **Actions > Attach to VPC**를 클릭합니다.
3. Cloud VPC (`10.10.0.0/16`)를 선택하고 **Attach**합니다.
4. State가 `attached`로 바뀌면 정상입니다.

### Step 3: Customer Gateway 생성

1. AWS 콘솔에서 **VPC > Customer Gateways**로 이동합니다.
2. **Create customer gateway** 버튼을 클릭합니다.
3. **Routing**은 `Static`을 선택합니다.
4. **IP Address**는 `terraform output onprem_vpn_appliance_public_ip`의 값을 입력합니다. 실제 운영 환경에서는 온프레미스 VPN 장비의 Public IP를 입력합니다.
5. **Create** 버튼을 클릭합니다.

### Step 4: Site to Site VPN 생성

1. AWS 콘솔에서 **VPC > Site-to-Site VPN Connections**로 이동합니다.
2. **Create VPN connection** 버튼을 클릭합니다.
3. 설정값을 입력합니다:
   - **Target gateway type**: Virtual Private Gateway 선택
   - **Virtual private gateway**: Step 2에서 생성한 VGW 선택
   - **Customer gateway**: Step 3에서 생성한 Customer Gateway 선택
   - **Routing options**: `Static` 선택
   - **Static IP prefixes**: `10.20.0.0/16` (온프레미스 VPC CIDR)
4. **Create** 버튼을 클릭합니다.

5. VPN 생성은 약 5분정도 걸립니다. State가 `Pending`에서 `Available`로 바뀌면 완료입니다.

> **Active/Standby 참고**: VGW Static Routing에서는 AWS가 두 터널 중 하나를 Active로, 나머지를 Standby로 지정합니다. 어떤 터널이 Active가 되는지는 AWS가 결정하며, 사용자가 직접 선택할 수 없습니다.

### Step 5: VGW Route Table 설정

VGW에서는 TGW와 달리 별도의 route table이 없습니다. 대신 VPC의 subnet route table에 VGW를 통한 경로를 추가해야 합니다.

1. Cloud VPC의 **private subnet route table**에 경로를 추가합니다.
2. AWS 콘솔에서 **VPC > Route Tables**로 이동합니다.
3. Cloud VPC의 private subnet route table을 선택합니다.
4. **Routes** 탭에서 **Edit routes**를 클릭합니다.
5. **Add route**를 클릭하고 다음 값을 입력합니다:
   - **Destination**: `10.20.0.0/16`
   - **Target**: 생성한 Virtual Private Gateway 선택
6. **Save changes**를 클릭합니다.

> **참고: Route Propagation 활성화**
>
> VGW를 사용할 때 route table에서 **Route Propagation**을 활성화할 수도 있습니다. VGW가 학습한 경로를 자동으로 route table에 추가해줍니다. 하지만 Static Routing에서는 수동으로 경로를 추가하는 게 더 명확하고 관리하기 편합니다.

#### 보안 관점: /32 Static Route로 접근 제한

온프레미스 전체 대역(`10.20.0.0/16`)을 열어주는 건 보안상 좋지 않습니다. 실제 운영 환경에서는 필요한 리소스만 접근할 수 있게 제한해야 합니다.

**NLB(Network Load Balancer)만 접근 허용하는 방법:**

VPC route table에 추가하는 경로의 Destination을 `/32`로 설정하면 특정 IP만 허용할 수 있습니다. 예를 들어, NLB의 IP가 `10.10.1.100`이라면:

- **Destination**: `10.10.1.100/32` (NLB IP)
- **Target**: Virtual Private Gateway

이렇게 하면 온프레미스는 NLB를 통해서만 AWS 리소스에 접근할 수 있습니다.

반대로, Site to Site VPN 생성 시 입력하는 **Static IP prefixes**도 온프레미스의 특정 IP만 입력하면, AWS에서 온프레미스로의 접근 범위도 제한할 수 있습니다.

> **주의**: NLB의 IP는 AZ별로 할당되므로, 모든 AZ의 NLB IP에 대해 /32 경로를 추가해야 합니다. NLB의 IP는 `aws elbv2 describe-load-balancers` 명령어로 확인하거나, Network Interfaces에서 확인할 수 있습니다.

### Step 6: 온프레미스 VPN 장비 설정 (EC2 + strongSwan)

- 온프레미스 VPN 장비는 EC2 인스턴스에서 설정합니다. strongSwan이 IPSec VPN을 담당합니다.
- BGP를 사용하지 않으므로 FRR은 필요없습니다. static route만으로 라우팅합니다.
- 설정 파일은 [scripts](./scripts) 디렉터리에 템플릿 형태로 있습니다. AWS Site to Site VPN Connection에서 다운로드한 설정 파일의 값을 템플릿에 채워넣는 방식입니다.

1. VPN 구성 파일 다운로드

AWS 콘솔에서 VPN 터널 설정을 위한 구성 정보를 다운로드합니다.

- AWS 콘솔에서 **VPC > Site-to-Site VPN Connections**로 이동합니다.
- **Download configuration** 버튼을 클릭합니다.
- **Vendor**를 `Generic`으로 선택하고 다운로드합니다. 이 텍스트 파일에 **두 개의 VPN 터널**에 대한 Pre-Shared Key, AWS 측 Public IP(VGW 엔드포인트) 등 모든 필수 정보가 들어있습니다.

2. 온프레미스 EC2인스턴스 접속

Terraform 출력으로 확인한 SSM 명령어로 `on_prem_vpn_appliance` 인스턴스에 접속합니다.

```sh
$ terraform output
onprem_vpn_appliance_ssm_command = "aws ssm start-session --target i-0322e0c81f094e1c3"

$ aws ssm start-session --target <on_prem_vpn_appliance의 인스턴스 ID>
(EC2 instance shell)$ sudo -i
```

3. strongSwan 설치

접속한 인스턴스(Ubuntu 24.04)에서 `strongSwan`을 설치합니다. BGP를 안 쓰므로 FRR은 설치하지 않습니다.

```sh
apt-get update -y
apt-get install -y strongswan
```

4. 환경변수 설정

[vpn-env.sh](./scripts/vpn-env.sh)를 참고해서 환경변수를 설정합니다. 다운로드한 VPN Configuration 파일에서 값을 추출합니다.

```sh
# VPN Configuration 파일에서 값을 추출하여 환경변수 설정
# 각 변수의 라인 번호는 vpn-env.sh 참조

# Customer Gateway Outside IP (온프레미스 VPN 장비의 Public IP)
export CUSTOMER_GATEWAY_OUTSIDE_IP="<VPN Configuration에서 확인>"

# Tunnel #1
export VPG_OUTSIDE_IP_TUNNEL1="<VPN Configuration에서 확인>"
export TUNNEL1_PSK="<VPN Configuration에서 확인>"
export CGW_INSIDE_IP_TUNNEL1="<VPN Configuration에서 확인>"
export VPG_INSIDE_IP_TUNNEL1="<VPN Configuration에서 확인>"

# Tunnel #2
export VPG_OUTSIDE_IP_TUNNEL2="<VPN Configuration에서 확인>"
export TUNNEL2_PSK="<VPN Configuration에서 확인>"
export CGW_INSIDE_IP_TUNNEL2="<VPN Configuration에서 확인>"
export VPG_INSIDE_IP_TUNNEL2="<VPN Configuration에서 확인>"

# On-Premises Network
export ONPREM_CIDR="10.20.0.0/16"
export ONPREM_GATEWAY="10.20.101.1"

# VPN Appliance Private IP (SNAT용)
export VPN_APPLIANCE_PRIVATE_IP="<EC2 Private IP>"
```

> **참고**: BGP 관련 환경변수(`CGW_ASN`, `VPG_ASN`, `BGP_NEIGHBOR_IP_*`)는 Static Routing에서는 필요없습니다.

5. strongSwan 설정 파일 생성

[scripts 가이드](./scripts/)대로 envsubst 명령어로 템플릿에서 설정 파일을 생성합니다.

```sh
cd /path/to/scripts
envsubst < ipsec.conf.template > ipsec.conf
envsubst < ipsec.secrets.template > ipsec.secrets
envsubst '$CGW_INSIDE_IP_TUNNEL1 $VPG_INSIDE_IP_TUNNEL1 $CGW_INSIDE_IP_TUNNEL2 $VPG_INSIDE_IP_TUNNEL2' < ipsec-vti-hook.sh.template > ipsec-vti-hook.sh
```

생성된 파일을 EC2인스턴스 내부에 복사합니다.

```sh
cp ipsec.conf /etc/ipsec.conf
cp ipsec.secrets /etc/ipsec.secrets
cp ipsec-vti-hook.sh /etc/ipsec.d/ipsec-vti-hook.sh
chmod +x /etc/ipsec.d/ipsec-vti-hook.sh
```

6. strongSwan 실행

```sh
systemctl restart strongswan-starter
```

로그에서 successfully 메세지가 보여야 합니다.

```sh
journalctl -u strongswan-starter -f
```

온프레미스 역할을 하는 EC2운영체제는 VPN통신을 위해 vti 네트워크 인터페이스가 생성됩니다.

```sh
ip addr show
```

vti1, vti2 인터페이스가 생성되었는지 확인합니다. Active/Standby이므로 두 터널 모두 IPSec은 UP이지만, 실제 트래픽은 하나의 터널로만 갑니다.

AWS 콘솔 Site to Site VPN에서 VPN 터널을 확인하면, 두 터널 모두 **IPSEC IS UP**이어야 합니다.

> **Active/Active(TGW+BGP)와의 차이점**: TGW+BGP 구성에서는 FRR을 통해 BGP 세션을 설정해야 터널 상태가 UP이 됩니다. 하지만 VGW+Static Routing에서는 IPSec만 설정하면 바로 터널 상태가 UP이 됩니다. BGP가 없으니 FRR 설정 단계가 없어서 훨씬 간단합니다.

7. 온프레미스 VPN 장비에 Static Route 추가

BGP 대신 수동으로 static route를 추가합니다. Cloud VPC 대역으로의 트래픽이 VTI 인터페이스를 통하도록 설정합니다.

```sh
# Cloud VPC 대역을 VTI 인터페이스로 라우팅
ip route add 10.10.0.0/16 dev vti1 metric 100
ip route add 10.10.0.0/16 dev vti2 metric 200
```

> **참고**: `metric` 값이 낮은 경로가 우선순위가 높습니다. vti1의 metric이 100으로 더 낮으므로, 정상 상태에서는 vti1을 통해 트래픽이 흐릅니다. vti1이 다운되면 vti2(metric 200)로 자동 전환됩니다.

### Step 7: 온프레미스 VPC subnet route table 설정

온프레미스 VPC subnet대역은 cloud대역과 통신할 때 VPN을 사용할 수 있도록, private route table에 VPN EC2 instance를 설정합니다.

1. AWS 콘솔에서 **VPC > Route Tables**로 이동합니다.
2. 온프레미스 VPC의 private subnet route table을 선택합니다.
3. **Routes** 탭에서 **Edit routes**를 클릭합니다.
4. **Add route**를 클릭하고 다음 값을 입력합니다:
   - **Destination**: `10.10.0.0/16` (Cloud VPC CIDR)
   - **Target**: 온프레미스 VPN appliance EC2 인스턴스의 ENI 선택
5. **Save changes**를 클릭합니다.

> **주의**: EC2를 라우팅 대상으로 설정할 때, 해당 EC2인스턴스의 **Source/Destination Check**이 비활성화되어 있어야 합니다. Terraform 모듈에서 이미 비활성화되어 있습니다.

### Step 8: 연결 테스트

onprem EC2인스턴스-> cloud인스턴스에서 curl을 테스트하거나, 반대로 cloud인스턴스 -> onprem EC2인스턴스 curl을 테스트합니다.

```sh
# 온프레미스 nginx에서 cloud nginx로 테스트
curl http://10.10.x.x

# cloud nginx에서 온프레미스 nginx로 테스트
curl http://10.20.x.x
```

> **참고**: x.x 부분은 각 EC2 인스턴스의 private IP로 대체합니다. `terraform output`으로 확인하거나, AWS 콘솔에서 확인할 수 있습니다.

두 `curl` 명령이 모두 성공적으로 반대편 서버의 메시지를 가져오면, Site-to-Site VPN이 완벽하게 구축된 것입니다.

### Active/Standby Failover 테스트

Active 터널의 failover를 직접 확인해봅니다.

1. Active 터널(vti1)을 수동으로 다운시킵니다:

```sh
ip link set vti1 down
```

2. Standby 터널(vti2)로 트래픽이 전환되는지 확인합니다:

```sh
curl http://10.10.x.x
```

3. 통신이 되면 failover가 정상 동작하는 겁니다.

4. 테스트가 끝나면 vti1을 복구합니다:

```sh
ip link set vti1 up
```

## Active/Active(TGW+BGP)와 Active/Standby(VGW+Static) 비교

| 항목 | Active/Active (TGW+BGP) | Active/Standby (VGW+Static) |
|------|------------------------|-----------------------------|
| Gateway | Transit Gateway (TGW) | Virtual Private Gateway (VGW) |
| 라우팅 | BGP (동적) | Static (수동) |
| 터널 구성 | Active/Active (ECMP) | Active/Standby |
| 필요 소프트웨어 | strongSwan + FRR | strongSwan만 |
| Failover 방식 | BGP 경로 자동 업데이트 | DPD 감지 후 Standby 전환 |
| Failover 시간 | 수 초 | 10~30초 (DPD 설정에 따라) |
| 비용 | TGW 시간당 요금 + 데이터 처리 요금 | VGW 무료 (VPN 연결 요금만) |
| 적합한 환경 | BGP 지원, 고가용성 요구 | BGP 미지원, 단순 구성 |

## 참고자료

* [AWS Site-to-Site VPN 사용 설명서](https://docs.aws.amazon.com/vpn/latest/s2svpn/)
* [VPN 터널 옵션](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPNTunnels.html)
* [Virtual Private Gateway](https://docs.aws.amazon.com/vpn/latest/s2svpn/SetUpVPNConnections.html)
