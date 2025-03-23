#!/bin/bash

set -e

cat > ./ipsec.conf <<EOF
#
# /etc/ipsec.conf
#
conn %default
    # Authentication Method : Pre-Shared Key
    leftauth=psk
    rightauth=psk
    # Encryption Algorithm : aes-128-cbc
    # Authentication Algorithm : sha1
    # Perfect Forward Secrecy : Diffie-Hellman Group 2
    ike=aes128-sha1-modp1024!
    # Lifetime : 28800 seconds
    ikelifetime=28800s
    # Phase 1 Negotiation Mode : main
    aggressive=no
    # Protocol : esp
    # Encryption Algorithm : aes-128-cbc
    # Authentication Algorithm : hmac-sha1-96
    # Perfect Forward Secrecy : Diffie-Hellman Group 2
    esp=aes128-sha1-modp1024!
    # Lifetime : 3600 seconds
    lifetime=3600s
    # Mode : tunnel
    type=tunnel
    # DPD Interval : 10
    dpddelay=10s
    # DPD Retries : 3
    dpdtimeout=30s
    # Tuning Parameters for AWS Virtual Private Gateway:
    keyexchange=ikev1
    rekey=yes
    reauth=no
    dpdaction=restart
    closeaction=restart
    leftsubnet=0.0.0.0/0,::/0
    rightsubnet=0.0.0.0/0,::/0
    # Create network interfacve
    leftupdown=/etc/ipsec-vti.sh
    installpolicy=yes
    compress=no
    mobike=no
conn AWS-VPC-GW1
    # Customer Gateway: :
    left=$LEFT_PRIVATE_IP
    leftid=$LEFT_PUBLIC_IP
    # Virtual Private Gateway :
    right=$RIGHT_PUBLIC_IP
    rightid=$RIGHT_PUBLIC_IP
    auto=start
    mark=100
    #reqid=1
EOF

cat > ./ipsec.secrets <<EOF
$LEFT_PUBLIC_IP $RIGHT_PUBLIC_IP : PSK "$PSK_SECRET"
EOF

echo "ipsec.conf and ipsec.secrets generated successfully!"
