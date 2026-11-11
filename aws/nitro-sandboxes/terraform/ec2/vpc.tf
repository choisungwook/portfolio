# default VPC를 쓰지 않고 실습 전용 VPC를 만든다. 부모 인스턴스 1대뿐이라 NAT 없이 public subnet만 둔다
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name = var.project_name
  cidr = "10.10.0.0/16"

  azs            = slice(data.aws_availability_zones.available.names, 0, 2)
  public_subnets = ["10.10.0.0/24", "10.10.1.0/24"]

  map_public_ip_on_launch = true
  enable_nat_gateway      = false
}
