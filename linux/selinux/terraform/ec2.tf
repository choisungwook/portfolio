resource "aws_instance" "selinux_lab" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.selinux_lab.id]
  iam_instance_profile   = aws_iam_instance_profile.selinux_lab.name
  user_data              = local.user_data

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_size
    encrypted   = true
  }

  tags = {
    Name = var.project_name
  }

  lifecycle {
    ignore_changes = [ami]
  }
}
