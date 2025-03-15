# onprem 역할 vpc
module "vpc_a" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/vpc?ref=v0.19"

  eks_cluster_name = "BGP" # just used for vpc tag

  vpc_cidr        = var.vpc_a_cidr
  public_subnets  = var.public_subnets_a
  private_subnets = var.private_subnets_a
}
