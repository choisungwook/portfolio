locals {
  az = data.aws_availability_zones.available.names[0]

  al2023_ami_name = var.arch == "arm64" ? "al2023-ami-*-kernel-6.1-arm64" : "al2023-ami-*-kernel-6.1-x86_64"

  # Every lab host runs the same throwaway HTTP listener on 8080 and carries
  # tcpdump so both ends of a flow can be observed.
  user_data = <<-EOT
    #!/bin/bash
    dnf install -y tcpdump
    cat > /etc/systemd/system/lab-http.service <<'UNIT'
    [Unit]
    Description=lab HTTP listener

    [Service]
    ExecStart=/usr/bin/python3 -m http.server 8080 --directory /tmp
    Restart=always

    [Install]
    WantedBy=multi-user.target
    UNIT
    systemctl daemon-reload
    systemctl enable --now lab-http.service
  EOT
}
