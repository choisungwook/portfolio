#!/bin/sh

yum install epel-release -y

# install docker
yum install -y yum-utils
yum-config-manager \
    --add-repo \
    https://download.docker.com/linux/centos/docker-ce.repo
curl -fsSL https://download.docker.com/linux/debian/gpg| apt-key add -
yum install docker-ce docker-ce-cli containerd.io -y

usermod -aG docker jenkins
chown root:jenkins /var/run/docker.sock

# install other packages
yum install -y \
    maven \
    nodejs \
    npm \
    java-1.8.0-openjdk