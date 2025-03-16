######################################################################
# VPC On-Premises (On-Premises Role)
######################################################################

vpc_onprem_cidr = "10.10.0.0/16"

public_subnets_onrpem = {
  "subnet_a1" = {
    cidr = "10.10.10.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "onprem-public-subnet-a1"
    }
  }
}

private_subnets_onprem = {
  "subnet_a1" = {
    cidr = "10.10.100.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "onprem-private-subnet-a1"
    }
  }
}

######################################################################
# VPC Cloud (AWS Cloud Role)
######################################################################

vpc_cloud_cidr = "10.20.0.0/16"

public_subnets_cloud = {
  "subnet_b1" = {
    cidr = "10.20.10.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "cloud-public-subnet-b1"
    }
  }
}

private_subnets_cloud = {
  "subnet_b1" = {
    cidr = "10.20.100.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "cloud-private-subnet-b1"
    }
  }
}
