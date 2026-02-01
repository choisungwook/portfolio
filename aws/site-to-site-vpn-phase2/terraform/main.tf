module "aws_cloud" {
  source                = "./modules/aws_cloud"
  project_name          = var.project_name
  cloud_vpc_cidr        = var.cloud_vpc_cidr
  onprem_vpc_cidr       = var.onprem_vpc_cidr
  cloud_private_subnets = var.cloud_private_subnets
  cloud_public_subnets  = var.cloud_public_subnets
  ami_id                = data.aws_ami.al2023_arm64.id
  ec2_volume_size       = var.cloud_ec2.volume_size
  instance_type         = var.cloud_ec2.instance_type
}

module "on_prem" {
  source = "./modules/on_prem"

  project_name           = var.project_name
  onprem_vpc_cidr        = var.onprem_vpc_cidr
  cloud_vpc_cidr         = var.cloud_vpc_cidr
  onprem_private_subnets = var.onprem_private_subnets
  onprem_public_subnets  = var.onprem_public_subnets
  ami_id                 = data.aws_ami.ubuntu_2404_x86_64.id
  ec2_volume_size        = var.onprem_ec2.volume_size
  instance_type          = var.onprem_ec2.instance_type

  onprem_nginx = {
    ami_id        = data.aws_ami.al2023_arm64.id
    instance_type = var.onprem_nginx.instance_type
    volume_size   = var.onprem_nginx.volume_size
  }
}
