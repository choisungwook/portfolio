#!/usr/bin/env bash
# 인증 배선은 pre_build의 setup-git-credential.sh가 끝냈으므로
# 여기서는 토큰 없는 평범한 URL로 clone한다.
# REPO_B_URL은 terraform이 환경변수로 넣어 준다.
set -euo pipefail

: "${REPO_B_URL:?REPO_B_URL is required}"

git clone --depth 1 "${REPO_B_URL}" b
bash b/helloworld.sh
