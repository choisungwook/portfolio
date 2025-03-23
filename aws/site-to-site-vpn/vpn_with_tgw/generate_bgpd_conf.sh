#!/bin/bash

cat <<EOF > ./bgpd.conf
#
# /etc/frr/bgpd.conf
#
router bgp ${FRR_ASN}
  bgp router-id ${TUNNEL1_LEFT_INNER_IP}
  neighbor ${TUNNEL1_RIGHT_INNER_IP} remote-as ${TGW_ASN}
  no bgp ebgp-requires-policy
  address-family ipv4 unicast
    redistribute connected
  exit-address-family
EOF

echo "Done"
