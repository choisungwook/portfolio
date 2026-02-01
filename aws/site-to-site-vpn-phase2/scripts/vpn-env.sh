# AWS Site-to-Site VPN Configuration Variables
# VPN Configuration 파일에서 값을 추출하여 설정하세요.

# VPN Connection ID (Line 11)
export VPN_CONNECTION_ID="vpn-0e8a9d3e5fed79fb9"

# Customer Gateway Outside IP (Line 93, 195 - 동일한 값)
export CUSTOMER_GATEWAY_OUTSIDE_IP="43.203.181.249"

# ============================================
# IPSec Tunnel #1 Configuration
# ============================================

# Virtual Private Gateway Outside IP (Line 94)
export VPG_OUTSIDE_IP_TUNNEL1="13.209.130.137"

# Pre-Shared Key (Line 36)
export TUNNEL1_PSK="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Customer Gateway Inside IP (Line 97)
export CGW_INSIDE_IP_TUNNEL1="169.254.144.26/30"

# Virtual Private Gateway Inside IP (Line 98)
export VPG_INSIDE_IP_TUNNEL1="169.254.144.25/30"

# ============================================
# IPSec Tunnel #2 Configuration
# ============================================

# Virtual Private Gateway Outside IP (Line 196)
export VPG_OUTSIDE_IP_TUNNEL2="43.203.56.128"

# Pre-Shared Key (Line 138)
export TUNNEL2_PSK="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Customer Gateway Inside IP (Line 199)
export CGW_INSIDE_IP_TUNNEL2="169.254.9.222/30"

# Virtual Private Gateway Inside IP (Line 200)
export VPG_INSIDE_IP_TUNNEL2="169.254.9.221/30"

# ============================================
# BGP Configuration
# ============================================

# Customer Gateway ASN (Line 111, 213)
export CGW_ASN="65000"

# Virtual Private Gateway ASN (Line 112, 214)
export VPG_ASN="64512"

# BGP Neighbor IP - Tunnel 1 (Line 113)
export BGP_NEIGHBOR_IP_TUNNEL1="169.254.144.25"

# BGP Neighbor IP - Tunnel 2 (Line 215)
export BGP_NEIGHBOR_IP_TUNNEL2="169.254.9.221"

# ============================================
# On-Premises Network Configuration
# ============================================

# On-Premises CIDR (AWS로 광고할 네트워크 대역)
export ONPREM_CIDR="10.20.0.0/16"

# On-Premises Gateway (온프레미스 기본 게이트웨이, 예약된 VPC Subnet x.x.x.1 주소 사용)
export ONPREM_GATEWAY="10.20.101.1"

# ============================================
# VPN Appliance SNAT Configuration
# ============================================

# VPN Appliance Private IP (VTI를 통해 나가는 패킷의 Source IP로 사용)
# - VTI 인터페이스의 IP (169.254.x.x)는 AWS TGW에서 라우팅할 수 없음
# - 따라서 VPN Appliance의 실제 Private IP로 SNAT 필요
# - 이 값은 VPN Appliance EC2 인스턴스의 Private IP 주소
# - 확인 방법: curl http://169.254.169.254/latest/meta-data/local-ipv4
export VPN_APPLIANCE_PRIVATE_IP="10.20.101.58"
