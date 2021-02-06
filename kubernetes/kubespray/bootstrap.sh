#!/bin/bash

# change timezone
timedatectl set-timezone Asia/Seoul

# permiet remote root login
sed -i -e 's/PasswordAuthentication no/PasswordAuthentication yes/g' /etc/ssh/sshd_config
sed -e 's/#PermitRootLogin yes/PermitRootLogin yes/' /etc/ssh/sshd_config
systemctl restart sshd

# update repository
yum install epel-release -y

# install linux package
yum install python3 python3-pip -y
yum install git net-tools wget -y

# clone kubespray project
git clone https://github.com/kubernetes-sigs/kubespray.git

# install python package
sudo pip3 install -r kubespray/requirements.txt

# set directory permission
chmod -R vagrant:vagrant kubespray