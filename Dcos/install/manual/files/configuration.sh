#!/bin/bash

# check root privileges
# reference: https://stackoverflow.com/questions/18215973/how-to-check-if-running-as-root-in-a-bash-script
if (( $EUID != 0 )); then
    echo "Please run as root"
    exit
fi

echo "[*] install centos repository"
yum install -y epel-release

echo "[*] install centos packages"
yum groupinstall -y "Development Tools"
yum -y --tolerant install perl tar xz unzip curl bind-utils net-tools ipset libtool-ltdl rsync nfs-utils kernel-devel pciutils

echo "[*] disable selinux"
sed -i 's/SELINUX=enforcing/SELINUX=permissive/g' /etc/selinux/config
setenforce permissive

echo "[*] disable firewall"
systemctl stop firewalld
systemctl disable firewalld

echo "[*] install ntp and sync time"
yum install -y ntp
timedatectl set-ntp yes
systemctl start ntpd && systemctl enable ntpd