#!/bin/bash

sleep 1;

dnf update -y
dnf install -y nginx

# Create a simple index page BEFORE starting nginx
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

# Start nginx AFTER creating the custom index.html
systemctl start nginx
systemctl enable nginx
