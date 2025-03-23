#!/bin/bash

set -e

cat > ./ipsec.conf <<EOF
conn Tunnel-1
    authby = secret
    auto = start

    # 1) 구간정보
    left = %defaultroute
    leftid = $LEFT_PUBLIC_IP               # Customer Gateway(내 GW) Public IP
    right = $RIGHT_PUBLIC_IP                 # AWS VGW Public IP
    type = tunnel
    keyexchange = ike

    # 2) IKE(Phase 1) 알고리즘
    ikev2 = never
    ike = aes256-sha2_256;modp2048
    ikelifetime = 8h
    keyingtries = %forever

    # 3) ESP(Phase 2) 알고리즘
    phase2 = esp
    phase2alg = aes256-sha2_256;modp2048
    keylife = 1h

    # 4) 서브넷 설정
    leftsubnet = $LEFT_SUBNET
    rightsubnet = $RIGHT_SUBNET

    # 5) DPD 설정
    dpddelay = 10
    dpdtimeout = 30
    dpdaction = restart_by_peer

    # 6) 중첩 IP 가능 여부
    overlapip = yes

conn Tunnel-2
    authby = secret
    auto = start

    # 1) 구간정보
    left = %defaultroute
    leftid = $LEFT_PUBLIC_IP_2             # Customer Gateway(내 GW) Public IP
    right = $RIGHT_PUBLIC_IP_2               # AWS VGW Public IP
    type = tunnel
    keyexchange = ike

    # 2) IKE(Phase 1) 알고리즘
    ikev2 = never
    ike = aes256-sha2_256;modp2048
    ikelifetime = 8h
    keyingtries = %forever

    # 3) ESP(Phase 2) 알고리즘
    phase2 = esp
    phase2alg = aes256-sha2_256;modp2048
    keylife = 1h

    # 4) 서브넷 설정
    leftsubnet = $LEFT_SUBNET_2
    rightsubnet = $RIGHT_SUBNET_2

    # 5) DPD 설정
    dpddelay = 10
    dpdtimeout = 30
    dpdaction = restart_by_peer

    # 6) 중첩 IP 가능 여부
    overlapip = yes
EOF

cat > ./ipsec.secrets <<EOF
$LEFT_PUBLIC_IP $RIGHT_PUBLIC_IP : PSK "$PSK_SECRET"
$LEFT_PUBLIC_IP_2 $RIGHT_PUBLIC_IP_2 : PSK "$PSK_SECRET_2"
EOF

echo "ipsec.conf and ipsec.secrets generated successfully!"
