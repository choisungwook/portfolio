#!/bin/bash
set -e

echo "===== ArgoCD 설치 시작 ====="

# ArgoCD namespace 생성
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

# Helm repo 추가
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# ArgoCD 설치
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
helm install argocd argo/argo-cd \
  --namespace argocd \
  --values "${SCRIPT_DIR}/values.yaml" \
  --wait

echo "===== ArgoCD 설치 완료 ====="

# 초기 admin 비밀번호 출력
echo ""
echo "[ArgoCD 접속 정보]"
echo "  URL: https://localhost:30443"
echo "  ID: admin"
echo -n "  PW: "
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
echo ""
