## 개요

* AWS site to site VPN connection를 VGW(Virtual Private Gateway)로 생성

## 전제조건

* 이 예제에서 제공하는 테라폼 코드를 실행
* 테라폼 코드에는 AWS tag가 설정되어 있습니다. AWS tag는 아래 자동화 스크립트 실행에 필요합니다.

## 환경변수 설정

```sh
# Libreswan EC2의 공인 IP
export LEFT_PUBLIC_IP=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=onprem-strongswan" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

export LEFT_SUBNET="10.10.0.0/16"   # 온프레미스 VPC 서브넷

# VPN connection id
export VPN_CONNECTION_ID=$(aws ec2 describe-vpn-connections \
    --filters "Name=tag:Name,Values=onprem-to-cloud-vpn" "Name=state,Values=available" \
    --query 'VpnConnections[0].VpnConnectionId' \
    --output text)

# AWS VPN Gateway의 공인 IP
export RIGHT_PUBLIC_IP=$(aws ec2 describe-vpn-connections \
    --vpn-connection-ids ${VPN_CONNECTION_ID} \
    --query 'VpnConnections[0].VgwTelemetry[0].OutsideIpAddress' \
    --output text)

# Cloud VPC 서브넷
export RIGHT_SUBNET="10.20.0.0/16"

# VPN 첫번째 터널의 사전 공유 키
export PSK_SECRET=$(aws ec2 describe-vpn-connections \
    --vpn-connection-ids ${VPN_CONNECTION_ID} \
    --query 'VpnConnections[0].Options.TunnelOptions[0].PreSharedKey' \
    --output text)
```

```sh
bash generate.sh
```

* EC2인스턴스에 설정파일 복사

```sh
ipsec.conf -> /etc/ipsec.d/aws.conf
ipsec.secrets -> /etc/ipsec.d/aws.secrets
```


* ipsec 실행

```sh
systemctl restart ipsec
```


* vti 네트워크 인터페이스 확인

```sh
ip addr show
```

* ip up

```sh
ip link set vti0 up
```


## Active standby

예시)

```sh
export LEFT_PUBLIC_IP=""   # Libreswan EC2의 공인 IP
export LEFT_SUBNET=""   # 온프레미스 VPC 서브넷
export RIGHT_PUBLIC_IP="" # AWS VPN Gateway의 공인 IP
export RIGHT_SUBNET=""     # AWS VPC 서브넷
export PSK_SECRET=""  # VPN 사전 공유 키

export LEFT_PUBLIC_IP_2=""   # Libreswan EC2의 공인 IP
export LEFT_SUBNET_2=""   # 온프레미스 VPC 서브넷
export RIGHT_PUBLIC_IP_2="" # AWS VPN Gateway의 공인 IP
export RIGHT_SUBNET_2=""     # AWS VPC 서브넷
export PSK_SECRET_2=""  # VPN 사전 공유 키
```
