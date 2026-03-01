locals {
  ami_id = var.os_type == "al2023" ? data.aws_ami.al2023.id : data.aws_ami.ubuntu.id
}

resource "aws_instance" "test" {
  ami                  = local.ami_id
  instance_type        = var.instance_type
  subnet_id            = data.aws_subnets.default.ids[0]
  iam_instance_profile = aws_iam_instance_profile.ssm.name

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-test"
  }
}
