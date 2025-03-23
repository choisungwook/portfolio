module "onprem_strongswan" {
  source = "../../../../common/terraform_module/ec2_strongswan"

  vpc_id            = module.vpc_onprem.vpc_id
  ec2_name          = "onprem"
  subnet_id         = module.vpc_onprem.public_subnets_ids[0]
  ec2_instance_type = "t4g.micro"
}

module "onprem_nginx" {
  source = "../../../../common/terraform_module/ec2_with_nginx"

  vpc_id            = module.vpc_onprem.vpc_id
  ec2_name          = "onprem-nginx"
  subnet_id         = module.vpc_onprem.private_subnets_ids[0]
  ec2_instance_type = "t4g.micro"
}

module "cloud_nginx" {
  source = "../../../common/terraform_module/ec2_with_nginx"

  vpc_id            = module.vpc_cloud.vpc_id
  ec2_name          = "cloud"
  subnet_id         = module.vpc_cloud.private_subnets_ids[0]
  ec2_instance_type = "t4g.micro"
}
