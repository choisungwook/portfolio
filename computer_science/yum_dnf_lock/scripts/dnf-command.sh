#!/usr/bin/env bash
set -euo pipefail

dnf -y makecache \
  --disablerepo='*' \
  --repofrompath=slow,http://127.0.0.1:8080/repo \
  --setopt=slow.gpgcheck=0 \
  --setopt=slow.repo_gpgcheck=0 \
  --setopt=metadata_expire=0
