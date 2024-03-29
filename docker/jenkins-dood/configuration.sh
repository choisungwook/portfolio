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

# install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
nvm install 10.16.3
npm install -g yarn@1.19.2

apt install -y \
    maven \
    vim \
    curl

# symbolic link
ln -s /root/.nvm/versions/node/v10.16.3/bin/yarn /usr/bin/yarn