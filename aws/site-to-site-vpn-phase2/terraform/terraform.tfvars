project_name           = "vpn-handson"
aws_region             = "ap-northeast-2"
cloud_vpc_cidr         = "10.10.0.0/16"
onprem_vpc_cidr        = "10.20.0.0/16"
cloud_private_subnets  = ["10.10.1.0/24", "10.10.2.0/24"]
cloud_public_subnets   = ["10.10.101.0/24", "10.10.102.0/24"]
onprem_private_subnets = ["10.20.1.0/24", "10.20.2.0/24"]
onprem_public_subnets  = ["10.20.101.0/24", "10.20.102.0/24"]

cloud_ec2 = {
  instance_type = "t4g.small"
  volume_size   = 20
}

onprem_ec2 = {
  instance_type = "t3.small"
  volume_size   = 20
}

onprem_nginx = {
  instance_type = "t4g.small"
  volume_size   = 20
}
