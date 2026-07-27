resource "aws_instance" "client" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.a_client.id
  vpc_security_group_ids = [aws_security_group.a_lab.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm.name
  user_data              = local.user_data

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-client"
  }
}

# Second ENI in another subnet. AL2023 ships amazon-ec2-net-utils, which builds
# policy routing rules for it automatically. The first scenario deletes those
# rules to see what they were protecting against.
resource "aws_network_interface" "client_secondary" {
  subnet_id       = aws_subnet.a_client_secondary.id
  security_groups = [aws_security_group.a_lab.id]

  tags = {
    Name = "${var.project_name}-client-secondary"
  }
}

resource "aws_network_interface_attachment" "client_secondary" {
  instance_id          = aws_instance.client.id
  network_interface_id = aws_network_interface.client_secondary.id
  device_index         = 1
}

# Sends traffic to the client's second ENI so the reply has to pick an interface.
resource "aws_instance" "probe" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.a_probe.id
  vpc_security_group_ids = [aws_security_group.a_lab.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm.name
  user_data              = local.user_data

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-probe"
  }
}

resource "aws_instance" "server" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.b_server.id
  vpc_security_group_ids = [aws_security_group.b_server.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm.name
  user_data              = local.user_data

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-server"
  }
}
