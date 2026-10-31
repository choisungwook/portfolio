#!/usr/bin/env bash
# Argo CD를 설치하고 manifests/argocd/의 ApplicationSet을 적용한다. KUBECONFIG가 k3s 클러스터를 가리켜야 한다.
set -euo pipefail
cd "$(dirname "$0")/.."

kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
# Argo CD CRD는 client-side apply의 annotation 크기 제한(262KB)을 넘어서 server-side apply가 필요하다.
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.6/manifests/install.yaml
# MLflow와 NVIDIA device plugin은 kustomization의 helmCharts로 Helm chart를 쓴다. Argo CD가 렌더링할 수 있게 켠다.
kubectl -n argocd patch configmap argocd-cm --type merge -p '{"data":{"kustomize.buildOptions":"--enable-helm"}}'
kubectl -n argocd rollout status statefulset/argocd-application-controller --timeout=300s
kubectl -n argocd rollout status deployment/argocd-repo-server --timeout=300s
kubectl -n argocd rollout status deployment/argocd-applicationset-controller --timeout=300s
kubectl apply -f manifests/argocd/
