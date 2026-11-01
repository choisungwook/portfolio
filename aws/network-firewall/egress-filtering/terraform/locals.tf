locals {
  azs      = ["${var.aws_region}a", "${var.aws_region}c"]
  vpc_cidr = "10.0.0.0/16"

  # Workload subnets. Each AZ gets its own route table so the default route can
  # point to the firewall endpoint in the same AZ (symmetric routing).
  app_subnets = {
    (local.azs[0]) = "10.0.20.0/24"
    (local.azs[1]) = "10.0.21.0/24"
  }
}
