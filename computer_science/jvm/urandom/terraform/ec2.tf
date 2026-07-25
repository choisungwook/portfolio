# 재현용 인스턴스: AL2 kernel 4.14 + JDK 8
resource "aws_instance" "legacy" {
  ami                  = data.aws_ami.al2_kernel414.id
  instance_type        = var.instance_type
  subnet_id            = data.aws_subnets.default.ids[0]
  iam_instance_profile = aws_iam_instance_profile.ec2_ssm.name

  # rngd가 entropy를 채우면 blocking 재현이 어려워서 꺼둔다
  user_data = <<-EOF
    #!/bin/bash
    yum install -y java-1.8.0-amazon-corretto-headless
    systemctl stop rngd 2>/dev/null || true
    systemctl disable rngd 2>/dev/null || true
  EOF

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-legacy-kernel414"
  }
}

# 대조용 인스턴스: AL2023 kernel 6.1 + JDK 17
resource "aws_instance" "modern" {
  ami                  = data.aws_ami.al2023.id
  instance_type        = var.instance_type
  subnet_id            = data.aws_subnets.default.ids[0]
  iam_instance_profile = aws_iam_instance_profile.ec2_ssm.name

  user_data = <<-EOF
    #!/bin/bash
    dnf install -y java-17-amazon-corretto-headless
  EOF

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-modern-kernel61"
  }
}
