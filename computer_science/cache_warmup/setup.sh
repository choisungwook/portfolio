#!/bin/bash
set -euo pipefail

CLUSTER_NAME="cache-warmup"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 1. Kind 클러스터 생성 ==="
if kind get clusters 2>/dev/null | grep -q "$CLUSTER_NAME"; then
  echo "클러스터 '$CLUSTER_NAME' 이미 존재. 삭제 후 재생성합니다."
  kind delete cluster --name "$CLUSTER_NAME"
fi
kind create cluster --name "$CLUSTER_NAME" --config "$SCRIPT_DIR/kind-config.yaml"

echo "=== 2. Docker 이미지 빌드 ==="
docker build -t product-api:latest "$SCRIPT_DIR/app"

echo "=== 3. Kind에 이미지 로드 ==="
kind load docker-image product-api:latest --name "$CLUSTER_NAME"

echo "=== 4. 모니터링 스택 배포 ==="
kubectl apply -f "$SCRIPT_DIR/k8s/monitoring/prometheus-config.yaml"
kubectl apply -f "$SCRIPT_DIR/k8s/monitoring/prometheus.yaml"
kubectl apply -f "$SCRIPT_DIR/k8s/monitoring/grafana-datasource.yaml"
kubectl apply -f "$SCRIPT_DIR/k8s/monitoring/grafana-dashboard.yaml"
kubectl apply -f "$SCRIPT_DIR/k8s/monitoring/grafana.yaml"

echo "=== 5. 애플리케이션 배포 ==="
kubectl apply -f "$SCRIPT_DIR/k8s/app/service.yaml"
kubectl apply -f "$SCRIPT_DIR/k8s/app/deployment-no-warmup.yaml"
kubectl apply -f "$SCRIPT_DIR/k8s/app/deployment-with-warmup.yaml"

echo "=== 6. Pod 준비 대기 ==="
kubectl wait --for=condition=ready pod -l app=product-api --timeout=120s
kubectl wait --for=condition=ready pod -l app=prometheus --timeout=120s
kubectl wait --for=condition=ready pod -l app=grafana --timeout=120s

echo ""
echo "=== 배포 완료 ==="
echo "No Warmup API : http://localhost:30080/products/1"
echo "With Warmup API: http://localhost:30081/products/1"
echo "Prometheus     : http://localhost:30090"
echo "Grafana        : http://localhost:30030 (admin/admin)"
echo ""
echo "K6 부하 테스트 실행:"
echo "  k6 run k6/load-test.js"
echo "  k6 run k6/spike-test.js"
