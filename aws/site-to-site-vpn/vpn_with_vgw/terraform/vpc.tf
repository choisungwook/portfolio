# onprem 역할 vpc
module "vpc_onprem" {
  source = "../../../../common/terraform_module/vpc"

  vpc_cidr        = var.vpc_onprem_cidr
  vpc_tag         = "onprem"
  public_subnets  = var.public_subnets_onrpem
  private_subnets = var.private_subnets_onprem
}

# cloud 역할 vpc
module "vpc_cloud" {
  source = "../../../../common/terraform_module/vpc"

  vpc_cidr        = var.vpc_cloud_cidr
  vpc_tag         = "cloud"
  public_subnets  = var.public_subnets_cloud
  private_subnets = var.private_subnets_cloud
}
