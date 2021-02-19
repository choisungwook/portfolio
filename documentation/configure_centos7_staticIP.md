# 개요
* centos7 IP변경
* 변경위치: /etc/sysconfig/network-scripts/ifcfg-[인터페이스]

# 설정
```sh
TYPE="Ethernet"
PROXY_METHOD="none"
BROWSER_ONLY="no"
#BOOTPROTO="dhcp"
DEFROUTE="yes"
IPV4_FAILURE_FATAL="no"
IPV6INIT="yes"
IPV6_AUTOCONF="yes"
IPV6_DEFROUTE="yes"
IPV6_FAILURE_FATAL="no"
IPV6_ADDR_GEN_MODE="stable-privacy"
NAME="enp0s3"
UUID="91af51db-7cf0-4069-9433-77d356b31bca"
DEVICE="enp0s3"

ONBOOT="yes"
BOOTPROTO="static"
IPADDR="192.168.0.123"
NETMASK="255.255.255.0"
GATEWAY="192.168.0.1"
DNS1="168.126.63.1"
DNS2="168.126.63.2"
```

# 재실행
```sh
systemctl restart network
```