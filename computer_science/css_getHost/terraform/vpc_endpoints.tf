# VPC Endpoint for AWS S3 service
resource "aws_vpc_endpoint" "s3_private" {
  vpc_id             = data.aws_vpc.default.id
  service_name       = "com.amazonaws.ap-northeast-2.s3"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = local.prviate_subnet_ids
  security_group_ids = [aws_security_group.s3_endpoint_sg.id]

  private_dns_enabled = false

  tags = {
    Name = "s3-private-endpoint"
  }
}


# Security group for S3 Interface Endpoint
resource "aws_security_group" "s3_endpoint_sg" {
  name_prefix = "s3-endpoint-sg"
  vpc_id      = data.aws_vpc.default.id

  # Allow HTTPS traffic from VPC
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }

  # Allow HTTP traffic from VPC (for redirects)
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "s3-endpoint-security-group"
  }
}
