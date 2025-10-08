#!/bin/bash

sleep 1;

dnf update -y
dnf install -y nginx
systemctl start nginx
systemctl enable nginx

# Create a simple index page
echo "[Info] Creating index.html"

cat > /usr/share/nginx/html/index.html <<'HTML'
<!DOCTYPE html>
<html>
<head>
  <title>nginx v1</title>
</head>
<body>
  <h1>nginx v1</h1>
</body>
</html>
HTML

echo "[Info] Done creating index.html"

systemctl restart nginx
