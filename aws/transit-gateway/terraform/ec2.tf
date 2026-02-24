# -----------------------------------------------------------------------------
# IAM Role for SSM Session Manager
# -----------------------------------------------------------------------------
resource "aws_iam_role" "ssm" {
  name = "${var.project_name}-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ssm" {
  name = "${var.project_name}-ssm-profile"
  role = aws_iam_role.ssm.name
}

# -----------------------------------------------------------------------------
# Security Group (각 VPC에 1개씩)
# 다른 VPC CIDR에서 오는 ICMP(ping)를 허용
# -----------------------------------------------------------------------------
locals {
  all_vpc_cidrs = [for k, v in var.vpc_configs : v.cidr]
}

resource "aws_security_group" "ec2" {
  for_each = var.vpc_configs

  name        = "${var.project_name}-ec2-sg-${each.key}"
  description = "Allow ICMP from all VPCs for Transit Gateway testing"
  vpc_id      = module.vpc[each.key].vpc_id

  tags = {
    Name = "${var.project_name}-ec2-sg-${each.key}"
  }
}

resource "aws_vpc_security_group_ingress_rule" "icmp" {
  for_each = var.vpc_configs

  security_group_id = aws_security_group.ec2[each.key].id
  description       = "ICMP from all VPCs"
  ip_protocol       = "icmp"
  from_port         = -1
  to_port           = -1
  cidr_ipv4         = "10.0.0.0/8"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  for_each = var.vpc_configs

  security_group_id = aws_security_group.ec2[each.key].id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# -----------------------------------------------------------------------------
# EC2 Instances (각 VPC에 1개씩)
# public subnet에 배치하여 SSM Session Manager로 접속
# -----------------------------------------------------------------------------
resource "aws_instance" "test" {
  for_each = var.vpc_configs

  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = module.vpc[each.key].public_subnets[0]
  iam_instance_profile   = aws_iam_instance_profile.ssm.name
  vpc_security_group_ids = [aws_security_group.ec2[each.key].id]

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-ec2-${each.key}"
  }
}
