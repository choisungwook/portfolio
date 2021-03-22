#!/bin/sh

route add default gw 192.168.25.1
route delete default gw 10.0.2.2 dev eth0
systemctl restart NetworkManager
ifdown eth1
ifup eth1