locals {
  hurl_arch = var.arch == "arm64" ? "aarch64" : "x86_64"
}

resource "aws_instance" "app" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.app_instance_type
  subnet_id                   = sort(data.aws_subnets.default.ids)[0]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.app.name
  vpc_security_group_ids      = [aws_security_group.app.id]

  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    dnf install -y docker
    systemctl enable --now docker
    usermod -aG docker ec2-user

    hurl_dir="hurl-${var.hurl_version}-${local.hurl_arch}-unknown-linux-gnu"
    curl -fsSL -o /tmp/hurl.tar.gz \
      "https://github.com/Orange-OpenSource/hurl/releases/download/${var.hurl_version}/$hurl_dir.tar.gz"
    tar -xzf /tmp/hurl.tar.gz -C /tmp
    install -m 0755 "/tmp/$hurl_dir/bin/hurl" /usr/local/bin/hurl
  EOT

  # IMDSv2 with hop limit 2 so app containers on the Docker bridge network can
  # retrieve the instance role credentials that sign the IAM connection token.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-app"
  }

  depends_on = [
    aws_iam_role_policy_attachment.ssm_core,
  ]
}
