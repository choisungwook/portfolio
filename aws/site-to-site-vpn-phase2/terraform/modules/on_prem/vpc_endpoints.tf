resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.ap-northeast-2.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "${var.project_name}-onprem-ssm-endpoint"
    Project = var.project_name
  }
}

resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.ap-northeast-2.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "${var.project_name}-onprem-ssmmessages-endpoint"
    Project = var.project_name
  }
}

resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.ap-northeast-2.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "${var.project_name}-onprem-ec2messages-endpoint"
    Project = var.project_name
  }
}

resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.project_name}-onprem-vpc-endpoints-sg"
  description = "Security group for VPC endpoints"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name    = "${var.project_name}-onprem-vpc-endpoints-sg"
    Project = var.project_name
  }
}

resource "aws_security_group_rule" "vpc_endpoints_ingress" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [var.onprem_vpc_cidr]
  security_group_id = aws_security_group.vpc_endpoints.id
  description       = "Allow HTTPS from VPC"
}

resource "aws_security_group_rule" "vpc_endpoints_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.vpc_endpoints.id
  description       = "Allow all outbound traffic"
}
