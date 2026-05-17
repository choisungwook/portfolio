#!/bin/bash
set -euo pipefail

kind delete cluster --name cache-warmup
echo "클러스터 삭제 완료"
