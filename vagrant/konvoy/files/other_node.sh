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
yum -y --tolerant install perl tar xz unzip curl bind-utils net-tools ipset libtool-ltdl rsync nfs-utils kernel-devel pciutils wget git tmux

# echo "[*] disable selinux"
sed -i 's/SELINUX=enforcing/SELINUX=permissive/g' /etc/selinux/config
setenforce permissive

echo "[*] disable firewall"
systemctl stop firewalld && systemctl disable firewalld

echo "[*] install chronyd and sync time"
yum install chrony -y
cp chrony.conf /etc/chrony.conf
systemctl restart chronyd
systemctl enable chronyd

echo "[*] set locale"
localectl set-locale LANG=en_US.utf8

echo "[*] remove tty for sudo"
sed -i'' -E 's/^(Defaults.*requiretty)/#\1/' /etc/sudoers

echo "[*] Disable sudo password prompts"
echo -e "%wheel ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

# disable swap
swapoff -a

# change root password
echo 'toor' | passwd --stdin root