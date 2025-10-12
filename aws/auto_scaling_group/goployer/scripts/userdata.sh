#!/bin/bash

dnf update -y
dnf install -y nginx

# Create a simple index page
cat > /usr/share/nginx/html/index.html <<'HTML'
<!DOCTYPE html>
<html>
<head>
  <title>Goployer Example</title>
</head>
<body>
  <h1>Hello from Goployer Example</h1>
  <p>Version: v1</p>
</body>
</html>
HTML

systemctl start nginx
systemctl enable nginx
