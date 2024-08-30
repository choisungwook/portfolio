#!/bin/bash

sleep 1

dnf update -y
dnf install -y docker tmux
systemctl start docker
systemctl enable docker
