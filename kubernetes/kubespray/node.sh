#!/bin/bash

# change timezone
timedatectl set-timezone Asia/Seoul

# disable firealld
systemctl disable firewalld

# IP forwarding
modprobe br_netfilter
sh -c "echo '1' > /proc/sys/net/bridge/bridge-nf-call-iptables"
sh -c "echo '1' > /proc/sys/net/ipv4/ip_forward"

# permit remote root login
sed -i -e 's/PasswordAuthentication no/PasswordAuthentication yes/g' /etc/ssh/sshd_config
sed -i -e 's/#PermitRootLogin yes/PermitRootLogin yes/' /etc/ssh/sshd_config
systemctl restart sshd

# update repository
yum install epel-release -y
yum install net-tools -y

# change root password
echo 'toor' | passwd --stdin root