# Docker 설치까지만 자동화한다. LiteLLM 기동은 학습자가 SSM 세션에서 직접 한다.
locals {
  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail
    dnf install -y docker
    systemctl enable --now docker
  EOF
}

resource "aws_instance" "litellm" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = module.vpc.private_subnets[0]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  vpc_security_group_ids = [aws_security_group.ec2.id]

  # 폐쇄망이므로 public IP를 붙이지 않는다.
  associate_public_ip_address = false

  user_data                   = local.user_data
  user_data_replace_on_change = true

  metadata_options {
    http_tokens = "required" # IMDSv2 강제
  }

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-litellm"
  }
}
