# EC2 security group. ingress 없음(SSM은 outbound만 쓴다). egress는 endpoint로 나가는 443만 연다.
resource "aws_security_group" "ec2" {
  name        = "${var.project_name}-ec2"
  description = "LiteLLM host. outbound to VPC endpoints only"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name = "${var.project_name}-ec2"
  }
}

resource "aws_vpc_security_group_egress_rule" "ec2_to_endpoints" {
  security_group_id            = aws_security_group.ec2.id
  description                  = "HTTPS to interface endpoints"
  referenced_security_group_id = aws_security_group.endpoint.id
  from_port                    = 443
  ip_protocol                  = "tcp"
  to_port                      = 443
}

# S3 gateway endpoint는 prefix list로 라우팅되므로 그쪽 443도 egress로 열어준다.
resource "aws_vpc_security_group_egress_rule" "ec2_to_s3" {
  security_group_id = aws_security_group.ec2.id
  description       = "HTTPS to S3 gateway endpoint"
  prefix_list_id    = aws_vpc_endpoint.s3.prefix_list_id
  from_port         = 443
  ip_protocol       = "tcp"
  to_port           = 443
}

# interface endpoint의 ENI에 붙는 security group. EC2에서 오는 443만 받는다.
resource "aws_security_group" "endpoint" {
  name        = "${var.project_name}-endpoint"
  description = "Interface VPC endpoints. inbound 443 from the EC2 host"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name = "${var.project_name}-endpoint"
  }
}

resource "aws_vpc_security_group_ingress_rule" "endpoint_from_ec2" {
  security_group_id            = aws_security_group.endpoint.id
  description                  = "HTTPS from the EC2 host"
  referenced_security_group_id = aws_security_group.ec2.id
  from_port                    = 443
  ip_protocol                  = "tcp"
  to_port                      = 443
}
