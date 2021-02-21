#!/bin/sh

# install docker
apt install \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg-agent \
    software-properties-common

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"

apt update && apt install docker-ce docker-ce-cli containerd.io
systemctl start docker && systemctl enable docker

# install linux packages
apt install maven \
            openjdk-8-jdk \
            nodejs \
            npm