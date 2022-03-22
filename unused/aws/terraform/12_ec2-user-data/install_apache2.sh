#!/bin/sh
sudo apt update
sudo apt install apache2 -y && sudo systemctl start apache2
sudo chown -R ubuntu:ubuntu /var/www/html
echo 'hello world' > /var/www/html/index.html