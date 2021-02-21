#!/bin/sh

# install docker
apt update
apt install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg-agent \
    software-properties-common

curl -fsSL https://download.docker.com/linux/debian/gpg| apt-key add -

add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/debian \
   $(lsb_release -cs) \
   stable"

apt update
apt install -y docker-ce docker-ce-cli containerd.io
systemctl start docker && systemctl enable docker

# install linux packages
apt install -y \
    maven \
    openjdk-8-jdk \
    nodejs \
    npm