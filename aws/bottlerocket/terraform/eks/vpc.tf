# 비용 절약을 위해 default VPC를 사용한다. default subnet은 공인 IP를 붙이므로 NAT 없이 SSM과 ECR public에 닿는다
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}
