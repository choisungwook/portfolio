#!/bin/bash
cat > /usr/local/bin/egress-probe <<'PROBE'
#!/bin/bash
# Prints one line every 2 seconds: time, HTTP code per domain (000 = failed).
while true; do
  line="$(date +%T)"
  for url in https://checkip.amazonaws.com https://www.google.com; do
    code=$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$url")
    line="$line ${url#https://}=$code"
  done
  echo "$line"
  sleep 2
done
PROBE
chmod +x /usr/local/bin/egress-probe

cat > /etc/systemd/system/egress-probe.service <<'UNIT'
[Unit]
Description=Egress probe
After=network-online.target

[Service]
ExecStart=/usr/local/bin/egress-probe
Restart=always

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now egress-probe
