module "docker_ec2" {
  source = "../../../common/terraform_module/ec2_with_docker"

  vpc_id            = module.vpc_a.vpc_id
  ec2_name          = "docker"
  subnet_id         = module.vpc_a.private_subnets_ids[0]
  ec2_instance_type = "t3.medium"
}
