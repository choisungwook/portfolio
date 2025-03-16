#!/bin/bash

set -e

cat > ./ipsec.conf <<EOF
conn AWS-VPC-GW1
    authby = secret
    auto = start
    type=tunnel

    #
    # 1) 구간정보
    #
    left = %defaultroute
    leftid = $LEFT_PUBLIC_IP               # Customer Gateway(내 GW) Public IP
    right = $RIGHT_PUBLIC_IP                 # AWS VGW Public IP
    type = tunnel
    keyexchange = ike

    #
    # 2) IKE(Phase 1) 알고리즘
    #
    #  - AES-256
    #  - SHA2-256
    #  - DH Group 14 -> modp2048
    #
    ikev2 = never
    ike = aes256-sha2_256;modp2048
    ikelifetime = 8h           # = 28800 seconds (AWS 기본값과 맞춤)
    keyingtries = %forever

    #
    # 3) ESP(Phase 2) 알고리즘
    #
    phase2 = esp
    phase2alg = aes256-sha2_256;modp2048
    keylife = 1h               # = 3600 seconds
    # (PFS를 위해 DH 재협상 시에도 Group 14 사용)

    #
    # 4) 서브넷 설정
    #
    #  - leftsubnet  = 온프레미스(내부) 사설망
    #  - rightsubnet = AWS VPC 측 사설망
    #
    leftsubnet = $LEFT_SUBNET
    rightsubnet = $RIGHT_SUBNET

    #
    # 5) DPD (Dead Peer Detection) 설정
    #
    dpddelay = 10
    dpdtimeout = 30
    dpdaction = restart_by_peer

    #
    # 6) VTI 관련
    #
    vti-interface=vti1
    vti-routing=yes
    mark=0x64/0xffffffff
    leftvti=$TUNNEL1_LEFT_INNER_IP  # AWS tunnel1 VTI IP
    rightvti=$TUNNEL1_RIGHT_INNER_IP # AWS side VTI IP

    #
    # 7) 중첩 IP(overlap IP) 가능 여부
    #    필요 시 사용 (AWS 예시 상 필요하다면)
    #
    overlapip = yes
EOF

cat > ./ipsec.secrets <<EOF
$LEFT_PUBLIC_IP $RIGHT_PUBLIC_IP : PSK "$PSK_SECRET"
EOF

echo "ipsec.conf and ipsec.secrets generated successfully!"
