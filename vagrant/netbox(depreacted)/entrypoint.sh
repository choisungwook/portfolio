#!/bin/sh

# postgres
echo "[*] install and configure postgres Database"
yum install https://download.postgresql.org/pub/repos/yum/9.6/redhat/rhel-7-x86_64/pgdg-redhat-repo-latest.noarch.rpm -y
yum install postgresql96 postgresql96-server postgresql96-contrib postgresql96-libs -y
/usr/pgsql-9.6/bin/postgresql96-setup initdb
systemctl enable postgresql-9.6.service
systemctl start postgresql-9.6.service

# redis
echo "[*] install and configure postgres Redis"
yum install -y redis
systemctl start redis
systemctl enable redis


# netbox
echo "[*] install and configure postgres netbox"
yum install -y gcc python36 python36-devel python3-pip libxml2-devel libxslt-devel libffi-devel openssl-devel redhat-rpm-config