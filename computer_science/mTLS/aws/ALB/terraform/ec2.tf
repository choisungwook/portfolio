# Get latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-arm64"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

resource "aws_security_group" "ec2" {
  name        = "mtls-ec2-sg"
  description = "Security group for EC2"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name        = "mtls-ec2-sg"
    environment = "test"
  }
}

resource "aws_security_group_rule" "ec2_ingress_http" {
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  security_group_id        = aws_security_group.ec2.id
}

resource "aws_security_group_rule" "ec2_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ec2.id
}

# nginx server
resource "aws_instance" "web_server" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t4g.micro"
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm_profile.name

  user_data = <<-EOF
              #!/bin/bash
              sleep 1; # wait for cloud-init to finish
              dnf update -y
              dnf install nginx -y
              systemctl enable nginx
              systemctl start nginx
              EOF

  tags = {
    Name        = "nginx-server"
    environment = "test"
  }
}
