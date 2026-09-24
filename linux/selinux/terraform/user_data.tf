# SELinux 모드는 바꾸지 않는다. permissive에서 enforcing으로 바꾸는 것부터 실습이다
locals {
  user_data = <<-EOT
    #!/bin/bash
    dnf install -y --setopt=strict=0 \
      policycoreutils-python-utils setools-console audit \
      nginx cryptsetup e2fsprogs vim-common
    systemctl enable --now auditd
  EOT
}
