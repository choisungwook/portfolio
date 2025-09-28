# Data source for default VPC
data "aws_vpc" "default" {
  default = true
}

# Data source for default subnets
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Data source for private subnets (assuming private subnets exist)
data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "tag:Name"
    values = ["*private*", "*Private*"]
  }
}

# Data source for route tables in the VPC
data "aws_route_tables" "default" {
  vpc_id = data.aws_vpc.default.id
}

# If no private subnets found, use default subnets
locals {
  # Use private subnets if available, otherwise use default subnets
  subnet_ids = length(data.aws_subnets.private.ids) > 0 ? data.aws_subnets.private.ids : data.aws_subnets.default.ids

  # Select first two subnets for NLB (NLB requires at least 2 AZs)
  prviate_subnet_ids = slice(local.subnet_ids, 0, min(2, length(local.subnet_ids)))
}
