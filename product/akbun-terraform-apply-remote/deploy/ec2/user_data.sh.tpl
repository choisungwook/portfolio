#!/bin/bash
set -euo pipefail

dnf install -y git unzip

# terraform 설치 (아키텍처에 맞는 아카이브 선택)
case "$(uname -m)" in
  aarch64) TF_ARCH=arm64 ;;
  x86_64) TF_ARCH=amd64 ;;
esac
curl -fsSL "https://releases.hashicorp.com/terraform/${terraform_version}/terraform_${terraform_version}_linux_$${TF_ARCH}.zip" -o /tmp/terraform.zip
unzip -o /tmp/terraform.zip -d /usr/local/bin
rm -f /tmp/terraform.zip

# 서버 바이너리 설치
mkdir -p /opt/atr/data
curl -fsSL "${binary_url}" -o /opt/atr/akbun-terraform-apply-remote
chmod +x /opt/atr/akbun-terraform-apply-remote

# 기동 시 SSM SecureString에서 secret을 읽어 env 파일을 만든다.
# secret이 디스크의 user_data나 terraform state 외에 코드에 남지 않게 한다.
cat > /usr/local/bin/atr-fetch-env <<'FETCH'
#!/bin/bash
set -euo pipefail
REGION="__AWS_REGION__"
WEBHOOK_SECRET=$(aws ssm get-parameter --region "$REGION" --name "__WEBHOOK_SECRET_PARAM__" --with-decryption --query Parameter.Value --output text)
GITHUB_TOKEN=$(aws ssm get-parameter --region "$REGION" --name "__GITHUB_TOKEN_PARAM__" --with-decryption --query Parameter.Value --output text)
umask 077
cat > /opt/atr/env <<ENV
ATR_WEBHOOK_SECRET=$WEBHOOK_SECRET
ATR_GITHUB_TOKEN=$GITHUB_TOKEN
ATR_PORT=__SERVER_PORT__
ATR_TRIGGER=__TRIGGER_WORD__
ATR_DATA_DIR=/opt/atr/data
ENV
FETCH
sed -i \
  -e "s|__AWS_REGION__|${aws_region}|" \
  -e "s|__WEBHOOK_SECRET_PARAM__|${webhook_secret_param}|" \
  -e "s|__GITHUB_TOKEN_PARAM__|${github_token_param}|" \
  -e "s|__SERVER_PORT__|${server_port}|" \
  -e "s|__TRIGGER_WORD__|${trigger_word}|" \
  /usr/local/bin/atr-fetch-env
chmod +x /usr/local/bin/atr-fetch-env

# systemd 서비스. TimeoutStopSec을 길게 잡아 서버가 진행 중인
# terraform 실행을 끝까지 마치고(drain) 내려가게 한다.
cat > /etc/systemd/system/atr.service <<'UNIT'
[Unit]
Description=akbun-terraform-apply-remote
After=network-online.target
Wants=network-online.target

[Service]
ExecStartPre=/usr/local/bin/atr-fetch-env
EnvironmentFile=/opt/atr/env
ExecStart=/opt/atr/akbun-terraform-apply-remote
WorkingDirectory=/opt/atr
KillSignal=SIGTERM
TimeoutStopSec=1830
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# self-deploy: binary_url을 주기적으로 확인해 바이너리가 바뀌면
# 교체하고 graceful restart한다. 새 바이너리를 URL에 올리는 것이 곧 배포다.
cat > /usr/local/bin/atr-self-update <<'UPDATE'
#!/bin/bash
set -euo pipefail
URL="__BINARY_URL__"
CURRENT=/opt/atr/akbun-terraform-apply-remote
CANDIDATE=$(mktemp)
trap 'rm -f "$CANDIDATE"' EXIT
curl -fsSL "$URL" -o "$CANDIDATE"
if ! cmp -s "$CANDIDATE" "$CURRENT"; then
  chmod +x "$CANDIDATE"
  mv "$CANDIDATE" "$CURRENT"
  trap - EXIT
  echo "new binary detected; restarting atr"
  systemctl restart atr
fi
UPDATE
sed -i "s|__BINARY_URL__|${binary_url}|" /usr/local/bin/atr-self-update
chmod +x /usr/local/bin/atr-self-update

cat > /etc/systemd/system/atr-update.service <<'UNIT'
[Unit]
Description=akbun-terraform-apply-remote self-update

[Service]
Type=oneshot
ExecStart=/usr/local/bin/atr-self-update
UNIT

cat > /etc/systemd/system/atr-update.timer <<'UNIT'
[Unit]
Description=Poll for a new akbun-terraform-apply-remote binary

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now atr.service atr-update.timer
