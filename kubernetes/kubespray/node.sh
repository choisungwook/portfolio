#!/bin/bash

# change timezone
timedatectl set-timezone Asia/Seoul

# permiet remote root login
sed -i -e 's/PasswordAuthentication no/PasswordAuthentication yes/g' /etc/ssh/sshd_config
sed -e 's/#PermitRootLogin yes/PermitRootLogin yes/' /etc/ssh/sshd_config
systemctl restart sshd

# update repository
yum install epel-release -y

# change root password
echo 'toor' | passwd --stdin root