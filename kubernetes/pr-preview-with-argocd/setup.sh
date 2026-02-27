#!/bin/bash
set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

echo "========================================"
echo " PR Preview 환경 셋업 시작"
echo "========================================"

# 1. Kind 클러스터 생성
echo ""
echo "[1/4] Kind 클러스터 생성"
if kind get clusters | grep -q "pr-preview"; then
  echo "  -> pr-preview 클러스터가 이미 존재합니다. 건너뜁니다."
else
  kind create cluster --config "${SCRIPT_DIR}/kind-cluster/kind-config.yaml"
  echo "  -> 클러스터 생성 완료"
fi

# 2. ArgoCD 설치
echo ""
echo "[2/4] ArgoCD 설치"
bash "${SCRIPT_DIR}/argocd/install.sh"

# 3. GitHub Token Secret 생성 (사용자에게 안내)
echo ""
echo "[3/4] GitHub Token 설정"
if [ -z "${GITHUB_TOKEN}" ]; then
  echo "  -> GITHUB_TOKEN 환경변수가 설정되지 않았습니다."
  echo "  -> 아래 명령어로 직접 생성하세요:"
  echo ""
  echo "     kubectl create secret generic github-token \\"
  echo "       --namespace argocd \\"
  echo "       --from-literal=token=<YOUR_GITHUB_TOKEN>"
  echo ""
else
  kubectl create secret generic github-token \
    --namespace argocd \
    --from-literal=token="${GITHUB_TOKEN}" \
    --dry-run=client -o yaml | kubectl apply -f -
  echo "  -> GitHub Token Secret 생성 완료"
fi

# 4. ApplicationSet 배포
echo ""
echo "[4/4] ApplicationSet 배포"
echo "  -> ApplicationSet을 배포하기 전에 pr-preview-appset.yaml을 편집하세요."
echo "  -> <GITHUB_OWNER>, <GITHUB_REPO>를 실제 값으로 변경해야 합니다."
echo ""
echo "  편집 후 아래 명령어로 배포:"
echo "  kubectl apply -f ${SCRIPT_DIR}/applicationset/pr-preview-appset.yaml"

echo ""
echo "========================================"
echo " 셋업 완료!"
echo "========================================"
echo ""
echo "[사용 방법]"
echo "  1. GitHub 저장소에서 PR을 생성합니다"
echo "  2. PR에 'preview' 라벨을 추가합니다"
echo "  3. ArgoCD가 자동으로 preview 환경을 생성합니다"
echo "  4. PR을 닫으면 preview 환경이 자동으로 삭제됩니다"
echo ""
echo "[ArgoCD 대시보드]"
echo "  URL: https://localhost:30443"
