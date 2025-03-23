## 개요

* AWS site to site VPN connection을 TGW로 생성

## 전제조건

* 이 예제에서 제공하는 테라폼 코드를 실행
* 테라폼 코드에는 AWS tag가 설정되어 있습니다. AWS tag는 아래 자동화 스크립트 실행에 필요합니다.

## 환경변수 설정

```sh
# strongswan EC2의 public IP
export LEFT_PUBLIC_IP=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=onprem-strongswan" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

# strongswan EC2의 private IP
export LEFT_PRIVATE_IP=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=onprem-strongswan" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].PrivateIpAddress' \
    --output text)

# VPN connection id
export VPN_CONNECTION_ID=$(aws ec2 describe-vpn-connections \
    --filters "Name=tag:Name,Values=tgw-vpn" "Name=state,Values=available" \
    --query 'VpnConnections[0].VpnConnectionId' \
    --output text)

# AWS VPN Gateway의 공인 IP
export RIGHT_PUBLIC_IP=$(aws ec2 describe-vpn-connections \
    --vpn-connection-ids ${VPN_CONNECTION_ID} \
    --query 'VpnConnections[0].VgwTelemetry[0].OutsideIpAddress' \
    --output text)

# VPN 첫번째 터널의 사전 공유 키
export PSK_SECRET=$(aws ec2 describe-vpn-connections \
    --vpn-connection-ids ${VPN_CONNECTION_ID} \
    --query 'VpnConnections[0].Options.TunnelOptions[0].PreSharedKey' \
    --output text)

# export INSIDE_IP_CUSTOMER_GATEWEAY=$(aws ec2 describe-vpn-connections \
#   --vpn-connection-ids $VPN_CONNECTION_ID \
#   --query 'VpnConnections[0].Options.TunnelOptions[0].TunnelInsideCidr' \
#   --output text)

# export INSIDE_IP_AWS_GATEWEAY=$(aws ec2 describe-vpn-connections \
#   --vpn-connection-ids $VPN_CONNECTION_ID \
#   --query 'VpnConnections[0].Options.TunnelOptions[1].TunnelInsideCidr' \
#   --output text)


```

```sh
# AWS console에서 Site to Site VPN connection configuration을 다운로드 받고, 아래 값을 설정하세요
export TUNNEL1_LEFT_INNER_IP_CIDR=169.254.198.138/30 # Inside IP Addresses Customer Gateway
export TUNNEL1_RIGHT_INNER_IP_CIDR=169.254.198.137/30  # Inside IP Addresses Virtual Private Gateway
export TUNNEL1_LEFT_INNER_IP=169.254.198.138 # Inside IP Addresses Customer Gateway
export TUNNEL1_RIGHT_INNER_IP=169.254.198.137  # Inside IP Addresses Virtual Private Gateway
```

```sh
bash generate-.sh
```

* EC2인스턴스에 설정파일 복사

```sh
ipsec.conf -> /etc/ipsec.conf
ipsec.secrets -> /etc/ipsec.secrets
ipsec-vti.sh -> /etc/ipsec-vti.sh
```


* ipsec 실행

```sh
rm -f /var/run/charon.pid /var/run/starter.charon.pid
systemctl start strongswan-starter
```

## bgp


```sh
export TGW_ASN=64512
export FRR_ASN=65000
```


## Active standby

예시)

```sh
export LEFT_PUBLIC_IP=""   # strongswan EC2의 공인 IP
export LEFT_SUBNET=""   # 온프레미스 VPC 서브넷
export RIGHT_PUBLIC_IP="" # AWS VPN Gateway의 공인 IP
export RIGHT_SUBNET=""     # AWS VPC 서브넷
export PSK_SECRET=""  # VPN 사전 공유 키

export LEFT_PUBLIC_IP_2=""   # strongswan EC2의 공인 IP
export LEFT_SUBNET_2=""   # 온프레미스 VPC 서브넷
export RIGHT_PUBLIC_IP_2="" # AWS VPN Gateway의 공인 IP
export RIGHT_SUBNET_2=""     # AWS VPC 서브넷
export PSK_SECRET_2=""  # VPN 사전 공유 키
```


## 테라폼 코드 주의사항


* AWS Site to Site VPN을 TGW유형으로 만들면, 자동으로 TGW VPN attachment가 생성됩니다. 그러므로 TGW attchment는 data필드로 사용해야 합니다.

```hcl

```


## 참고자료

* https://zhimin-wen.medium.com/setup-aws-site-to-site-vpn-connection-with-transit-gateway-c516422cf5d2
* https://github.com/acantril/learn-cantrill-io-labs/tree/master/aws-hybrid-bgpvpn/02_INSTRUCTIONS
* https://youtu.be/wVyY22Nuxis?feature=shared
* https://heywantodo.tistory.com/302
