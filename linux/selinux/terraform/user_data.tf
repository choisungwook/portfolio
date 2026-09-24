# SELinux 모드는 핸즈온에서 직접 바꾸므로 user data는 도구 설치만 한다
locals {
  lab_packages = [
    "docker",
    "container-selinux",
    "cryptsetup",
    "policycoreutils-python-utils",
    "setools-console",
    "checkpolicy",
    "selinux-policy-devel",
    "python3",
  ]

  user_data = <<-EOT
    #!/bin/bash
    dnf install -y --skip-broken ${join(" ", local.lab_packages)}
    mkdir -p /etc/docker
    echo '{"selinux-enabled": true}' > /etc/docker/daemon.json
    systemctl enable --now docker
  EOT
}
