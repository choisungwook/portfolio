#!/usr/bin/env bash
# CodeBuild helper가 source repo path로만 토큰을 내주는 제약을 우회한다.
# source repo path로 토큰을 한 번 꺼내 전역 credential store에 심으면,
# 이후 모든 git 명령이 토큰 없는 URL 그대로 동작한다.
# REPO_A_PATH는 terraform이 환경변수로 넣어 준다. 예) my-org/a.git
set -euo pipefail

: "${REPO_A_PATH:?REPO_A_PATH is required (e.g. my-org/a.git)}"

HELPER=/codebuild/readonly/bin/git-credential-helper
CRED_FILE="${HOME}/.git-credentials-codebuild"

echo "현재 git credential 설정"
git config --list | grep -i credential || true

token="$(printf 'protocol=https\nhost=github.com\npath=%s\n\n' "${REPO_A_PATH}" \
  | "${HELPER}" get \
  | sed -n 's/^password=//p')"

if [ -z "${token}" ]; then
  echo "source repo path로도 토큰을 받지 못했다. connection 상태와 IAM 권한을 확인할 것" >&2
  exit 1
fi

# 토큰 값 자체는 로그에 남기지 않는다. prefix만 찍어 installation token인지 확인한다.
echo "토큰 확보: prefix=${token:0:4}"

: > "${CRED_FILE}"
chmod 600 "${CRED_FILE}"
# x-access-token은 GitHub이 무시하는 더미 username이다. password 자리의 토큰만 유효하면 된다.
printf 'https://x-access-token:%s@github.com\n' "${token}" > "${CRED_FILE}"

# CodeBuild가 심은 helper 목록을 빈 값으로 비우고 store로 교체한다.
# useHttpPath=false로 되돌려 host 단위 매칭을 시켜야 확보한 토큰이 다른 repo에도 쓰인다.
git config --global --replace-all credential.helper ""
git config --global --add credential.helper "store --file=${CRED_FILE}"
git config --global credential.useHttpPath false

echo "credential store 설정 완료"
