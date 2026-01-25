module "aws_cloud" {
  source                    = "./modules/aws_cloud"
  project_name              = var.project_name
  aws_cloud_vpc_cidr        = var.aws_cloud_vpc_cidr
  on_prem_vpc_cidr          = var.on_prem_vpc_cidr
  aws_cloud_private_subnets = var.aws_cloud_private_subnets
  aws_cloud_public_subnets  = var.aws_cloud_public_subnets
  ami_id                    = data.aws_ami.al2023_arm64.id
  ec2_volume_size           = var.aws_cloud_ec2_volume_size
  instance_type             = var.aws_cloud_instance_type
}

module "on_prem" {
  source = "./modules/on_prem"

  project_name            = var.project_name
  on_prem_vpc_cidr        = var.on_prem_vpc_cidr
  aws_cloud_vpc_cidr      = var.aws_cloud_vpc_cidr
  on_prem_private_subnets = var.on_prem_private_subnets
  on_prem_public_subnets  = var.on_prem_public_subnets
  ami_id                  = data.aws_ami.ubuntu_2404_x86_64.id
  ec2_volume_size         = var.on_prem_ec2_volume_size
  instance_type           = var.on_prem_instance_type
}
