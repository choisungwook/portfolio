#!/bin/bash
set -euo pipefail

# ===========================================
# Step 1: System Update
# ===========================================
echo "=== [Step 1] System Update ==="

# EKS 핵심 컴포넌트(kubelet, containerd, nodeadm)는 제외하고 업데이트
# 이 컴포넌트들은 EKS optimized AMI 버전에 맞게 고정되어야 한다
sudo dnf update -y --exclude='kubelet*' --exclude='containerd*' --exclude='nodeadm*'

# ===========================================
# Step 2: Install Custom Tools
# ===========================================
echo "=== [Step 2] Install Custom Tools ==="

# -----------------------------------------------
# 추가 패키지를 아래에 설치한다.
# 각 프로그램은 다음 패턴을 따른다:
#   1. 패키지 설치 또는 바이너리 다운로드
#   2. 버전 확인으로 설치 검증
# -----------------------------------------------

# nginx (빌드 검증용 테스트 패키지)
sudo dnf install -y nginx
nginx -v

# ===========================================
# Step 3: OS Hardening
# ===========================================
echo "=== [Step 3] OS Hardening ==="

# -----------------------------------------------
# OS 보안 강화 설정을 아래에 추가한다.
# 예시:
#   sudo systemctl disable --now <service>
#   echo "net.ipv4.conf.all.send_redirects = 0" | sudo tee -a /etc/sysctl.d/99-hardening.conf
# -----------------------------------------------

# ===========================================
# Step 4: Cleanup
# ===========================================
echo "=== [Step 4] AMI Cleanup ==="

# 패키지 매니저 캐시 삭제
sudo dnf clean all
sudo rm -rf /var/cache/dnf

# 임시 파일 삭제
sudo rm -rf /tmp/* /var/tmp/*

# SSH host key 삭제 (첫 부팅 시 자동 재생성)
sudo rm -f /etc/ssh/ssh_host_*

# 로그 파일 비우기
sudo find /var/log -type f -exec truncate -s 0 {} \;

# 셸 히스토리 삭제
cat /dev/null > ~/.bash_history
history -c || true

# ===========================================
# Step 5: Validation
# ===========================================
echo "=== [Step 5] AMI Validation ==="

ERRORS=0

# kubelet 확인 (EKS optimized AMI 필수 컴포넌트)
if command -v kubelet &>/dev/null; then
  echo "[OK] kubelet found: $(kubelet --version 2>/dev/null || echo 'version check skipped')"
else
  echo "[FAIL] kubelet not found"
  ERRORS=$((ERRORS + 1))
fi

# containerd 확인
if command -v containerd &>/dev/null; then
  echo "[OK] containerd found: $(containerd --version 2>/dev/null || echo 'version check skipped')"
else
  echo "[FAIL] containerd not found"
  ERRORS=$((ERRORS + 1))
fi

# nodeadm 확인 (AL2023 EKS 노드 조인에 필수)
if command -v nodeadm &>/dev/null; then
  echo "[OK] nodeadm found: $(nodeadm version 2>/dev/null || echo 'version check skipped')"
else
  echo "[FAIL] nodeadm not found"
  ERRORS=$((ERRORS + 1))
fi

# nginx 확인 (빌드 검증용 테스트 패키지)
if command -v nginx &>/dev/null; then
  echo "[OK] nginx found: $(nginx -v 2>&1)"
else
  echo "[FAIL] nginx not found"
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
  echo "[FAIL] Validation failed with $ERRORS error(s)"
  exit 1
fi

echo "=== All steps completed ==="
