# Two instances that differ only in tags. Every policy in policies/ treats them differently
# because of that difference, and nothing else.

resource "aws_instance" "tagged" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm.name

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name         = "${var.project_name}-tagged"
    Owner        = "akbun"
    Environment  = "dev"
    c7n_schedule = "off"
  }
}

resource "aws_instance" "untagged" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm.name

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  # No Owner, no Environment, no schedule. This is the instance the lab is about.
  tags = {
    Name = "${var.project_name}-untagged"
  }

  # Custodian stops this instance during the lab. Do not let Terraform start it again.
  lifecycle {
    ignore_changes = [tags["c7n_tag_compliance"], tags["c7n_rightsizing"]]
  }
}
