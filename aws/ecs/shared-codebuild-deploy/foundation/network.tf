module "lab_vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "6.7.3"

  name                          = var.project_name
  cidr                          = var.vpc_cidr
  azs                           = slice(data.aws_availability_zones.lab.names, 0, length(var.public_subnet_cidrs))
  public_subnets                = var.public_subnet_cidrs
  enable_nat_gateway            = false
  enable_vpn_gateway            = false
  enable_dns_hostnames          = true
  manage_default_vpc            = false
  manage_default_network_acl    = false
  manage_default_route_table    = false
  manage_default_security_group = false

  tags = {
    ManagedBy = "Terraform"
    Project   = var.project_name
  }
}

resource "aws_security_group" "hello_tasks" {
  name        = "${var.project_name}-tasks"
  description = "Hello HTTP access from the lab operator"
  vpc_id      = module.lab_vpc.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "hello_http" {
  security_group_id = aws_security_group.hello_tasks.id
  cidr_ipv4         = var.allowed_cidr
  ip_protocol       = "tcp"
  from_port         = 8080
  to_port           = 8080
}

resource "aws_vpc_security_group_egress_rule" "task_outbound" {
  security_group_id = aws_security_group.hello_tasks.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
