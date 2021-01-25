#!/bin/bash

# check root privileges
# reference: https://stackoverflow.com/questions/18215973/how-to-check-if-running-as-root-in-a-bash-script
if (( $EUID != 0 )); then
    echo "Please run as root"
    exit
fi

WORKSPACE="/home/vagrant/files"

echo "[*] install centos repository"
yum install -y epel-release

echo "[*] install centos packages"
yum groupinstall -y "Development Tools"
yum -y --tolerant install perl tar xz unzip curl bind-utils net-tools ipset libtool-ltdl rsync nfs-utils kernel-devel pciutils

echo "[*] disable selinux"
sed -i 's/SELINUX=enforcing/SELINUX=permissive/g' /etc/selinux/config
setenforce permissive

echo "[*] disable firewall"
systemctl stop firewalld && systemctl disable firewalld

echo "[*] install ntp and sync time"
yum install -y ntp
timedatectl set-timezone Asia/Seoul
timedatectl set-ntp yes
cp ${WORKSPACE}/ntp.conf /etc/ntp.conf
ntpq -p
systemctl start ntpd && systemctl enable ntpd

echo "[*] disable dnsmasq"
systemctl stop dnsmasq && disable dnsmasq

echo "[*] set locale"
localectl set-locale LANG=en_US.utf8

echo "[*] remove tty for sudo"
sed -i'' -E 's/^(Defaults.*requiretty)/#\1/' /etc/sudoers

echo "[*] Disable sudo password prompts"
echo -e "%wheel ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

echo "[*] set journald limits"
mkdir -p /etc/systemd/journald.conf.d/
echo -e "[Journal]\nSystemMaxUse=15G" > /etc/systemd/journald.conf.d/dcos-el7-ami.conf

echo "[*] install docker"
# reference: https://docs.docker.com/engine/install/centos/
yum install -y yum-utils
yum-config-manager \
    --add-repo \
    https://download.docker.com/linux/centos/docker-ce.repo
yum install docker-ce docker-ce-cli containerd.io

echo "[*] start docker and persistence configuration"
systemctl start docker && systemctl enable docker

# copy docker configuration file and restart docker
cp ${WORKSPACE}/daemon.json /etc/docker/daemon.json
systemctl daemon-reload && systemctl restart docker

# add docker group
/usr/sbin/groupadd -f docker
/usr/sbin/groupadd -f nogroup