resource "aws_security_group" "managed_node" {
  name        = "${var.project_name}-managed-node"
  description = "SSM Agent outbound only. No ingress"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_egress_rule" "https" {
  security_group_id = aws_security_group.managed_node.id
  description       = "SSM endpoint and package repository"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_instance" "managed_node" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.managed_node.id]
  iam_instance_profile   = aws_iam_instance_profile.managed_node.name

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_size
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required"
  }

  tags = {
    Name = "${var.project_name}-node"
    Team = "platform"
  }
}
