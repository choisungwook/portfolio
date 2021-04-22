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
usermod -aG docker jenkins

# install jdk8
wget -qO - https://adoptopenjdk.jfrog.io/adoptopenjdk/api/gpg/key/public | apt-key add -
add-apt-repository --yes https://adoptopenjdk.jfrog.io/adoptopenjdk/deb/
apt update
apt install -y adoptopenjdk-8-hotspot

# install nodejs12
curl -sL https://deb.nodesource.com/setup_12.x | bash -
apt update
apt install -y nodejs

apt install -y \
    maven \
    npm \
    vim \
    curl

# install yarn
npm install --global yarn