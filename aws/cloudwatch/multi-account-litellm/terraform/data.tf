data "aws_caller_identity" "monitoring" {
  provider = aws.monitoring
}

data "aws_caller_identity" "dev" {
  provider = aws.dev
}

data "aws_caller_identity" "prod" {
  provider = aws.prod
}

data "aws_vpc" "monitoring" {
  provider = aws.monitoring
  default  = true
}

data "aws_vpc" "dev" {
  provider = aws.dev
  default  = true
}

data "aws_vpc" "prod" {
  provider = aws.prod
  default  = true
}

data "aws_subnets" "monitoring" {
  provider = aws.monitoring

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.monitoring.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_subnets" "dev" {
  provider = aws.dev

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.dev.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_subnets" "prod" {
  provider = aws.prod

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.prod.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "http" "my_ip" {
  url = "https://api.ipify.org?format=text"
}
