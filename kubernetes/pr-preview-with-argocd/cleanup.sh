#!/bin/bash
set -e

echo "===== PR Preview 환경 정리 시작 ====="

# Kind 클러스터 삭제
if kind get clusters | grep -q "pr-preview"; then
  kind delete cluster --name pr-preview
  echo "pr-preview 클러스터 삭제 완료"
else
  echo "pr-preview 클러스터가 존재하지 않습니다"
fi

echo "===== 정리 완료 ====="
