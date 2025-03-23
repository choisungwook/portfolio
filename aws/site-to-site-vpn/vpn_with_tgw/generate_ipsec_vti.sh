cat > ./ipsec-vti.sh <<EOF
#!/bin/bash

#
# /etc/ipsec-vti.sh
#

PLUTO_MARK_OUT_ARR=(\${PLUTO_MARK_OUT//// })
PLUTO_MARK_IN_ARR=(\${PLUTO_MARK_IN//// })

case "\${PLUTO_CONNECTION}" in
  AWS-VPC-GW1)
  VTI_INTERFACE=vti1
  VTI_LOCALADDR=$TUNNEL1_LEFT_INNER_IP
  VTI_REMOTEADDR=$TUNNEL1_RIGHT_INNER_IP
  ;;
esac

case "\${PLUTO_VERB}" in
  up-client)
  #ip tunnel add \${VTI_INTERFACE} mode vti local \${PLUTO_ME} remote \${PLUTO_PEER} okey \${PLUTO_MARK_OUT_ARR[0]} ikey \${PLUTO_MARK_IN_ARR[0]}
  ip link add \${VTI_INTERFACE} type vti local \${PLUTO_ME} remote \${PLUTO_PEER} okey \${PLUTO_MARK_OUT_ARR[0]} ikey \${PLUTO_MARK_IN_ARR[0]}
  sysctl -w net.ipv4.conf.\${VTI_INTERFACE}.disable_policy=1
  sysctl -w net.ipv4.conf.\${VTI_INTERFACE}.rp_filter=2 || sysctl -w net.ipv4.conf.\${VTI_INTERFACE}.rp_filter=0
  ip addr add \${VTI_LOCALADDR} remote \${VTI_REMOTEADDR} dev \${VTI_INTERFACE}
  ip link set \${VTI_INTERFACE} up mtu 1436
  iptables -t mangle -I FORWARD -o \${VTI_INTERFACE} -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
  iptables -t mangle -I INPUT -p esp -s \${PLUTO_PEER} -d \${PLUTO_ME} -j MARK --set-xmark \${PLUTO_MARK_IN}
  ip route flush table 220
  #/etc/init.d/bgpd reload || /etc/init.d/quagga force-reload bgpd
  ;;
  down-client)
  #ip tunnel del \${VTI_INTERFACE}
  ip link del \${VTI_INTERFACE}
  iptables -t mangle -D FORWARD -o \${VTI_INTERFACE} -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
  iptables -t mangle -D INPUT -p esp -s \${PLUTO_PEER} -d \${PLUTO_ME} -j MARK --set-xmark \${PLUTO_MARK_IN}
  ;;
esac

# Enable IPv4 forwarding
sysctl -w net.ipv4.ip_forward=1
sysctl -w net.ipv4.conf.ens5.disable_xfrm=1
sysctl -w net.ipv4.conf.ens5.disable_policy=1
EOF
