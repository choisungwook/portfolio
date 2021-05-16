#!/bin/sh

# disable selinux 
echo "[*] disable selinux start"
sed -i 's/SELINUX=enforcing/SELINUX=permissive/g' /etc/selinux/config
setenforce permissive
echo "[*] disable selinux done"

# install jdk8 skip
# echo "[*] install jdk8 start"
# yum install java-1.8.0-openjdk-devel.x86_64 -y
# echo "[*] install jdk8 done"

# disable firewall
echo "[*] configure firewall start"
systemctl stop firewalld & systemctl disable firewalld
echo "[*] configure firewall done"

# install chrony instread of ntp
echo "[*] install chrony start"
yum install chrony -y
cp chrony.conf /etc/chrony.conf # chrony설정파일 복사
systemctl enable chronyd && systemctl restart chronyd
echo "[*] install chrony done"

echo "[*] configure tiemezone start"
timedatectl set-timezone Asia/Seoul
timedatectl set-ntp true
echo "[*] configure tiemezone end"

# skip install python. because the python already installed
echo "[*] install python skipped"
