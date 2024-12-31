MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="==MYBOUNDARY=="

--==MYBOUNDARY==
Content-Type: text/x-shellscript; charset="us-ascii"

#!/bin/bash
dnf update -y
dnf install -y nginx

systemctl start nginx
systemctl enable nginx

--==MYBOUNDARY==--
