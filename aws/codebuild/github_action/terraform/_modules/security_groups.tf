resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb-sg"
  description = "Security group for ALB"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-alb-sg"
    }
  )
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  for_each = toset(var.alb_allowed_cidrs)

  security_group_id = aws_security_group.alb.id
  description       = "Allow HTTPS from allowed CIDRs"
  cidr_ipv4         = each.value
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"

  tags = {
    Name = "alb-https-${each.key}"
  }
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow all outbound traffic"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name = "alb-egress-all"
  }
}

resource "aws_security_group" "nexus_ec2" {
  name        = "${var.name_prefix}-nexus-ec2-sg"
  description = "Security group for Nexus EC2"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nexus-ec2-sg"
    }
  )
}

resource "aws_vpc_security_group_ingress_rule" "nexus_from_alb" {
  security_group_id            = aws_security_group.nexus_ec2.id
  description                  = "Allow traffic from public ALB"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 8081
  to_port                      = 8081
  ip_protocol                  = "tcp"

  tags = {
    Name = "nexus-from-public-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "nexus_from_private_alb" {
  security_group_id            = aws_security_group.nexus_ec2.id
  description                  = "Allow traffic from private ALB"
  referenced_security_group_id = aws_security_group.private_alb.id
  from_port                    = 8081
  to_port                      = 8081
  ip_protocol                  = "tcp"

  tags = {
    Name = "nexus-from-private-alb"
  }
}

resource "aws_vpc_security_group_egress_rule" "nexus_all" {
  security_group_id = aws_security_group.nexus_ec2.id
  description       = "Allow all outbound traffic"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name = "nexus-egress-all"
  }
}
