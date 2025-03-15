######################################################################
# VPC A (On-Premises Role)
######################################################################

vpc_a_cidr = "10.10.0.0/16"

public_subnets_a = {
  "subnet_a1" = {
    cidr = "10.10.10.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "onprem-public-subnet-a1"
    }
  },
  "subnet_a2" = {
    cidr = "10.10.11.0/24",
    az   = "ap-northeast-2c",
    tags = {
      Name = "onprem-public-subnet-a2"
    }
  }
}

private_subnets_a = {
  "subnet_a1" = {
    cidr = "10.10.100.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "onprem-private-subnet-a1"
    }
  },
  "subnet_a2" = {
    cidr = "10.10.101.0/24",
    az   = "ap-northeast-2c",
    tags = {
      Name = "onprem-private-subnet-a2"
    }
  }
}

######################################################################
# VPC B (AWS Cloud Role)
######################################################################

vpc_b_cidr = "10.20.0.0/16"

public_subnets_b = {
  "subnet_b1" = {
    cidr = "10.20.10.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "cloud-public-subnet-b1"
    }
  },
  "subnet_b2" = {
    cidr = "10.20.11.0/24",
    az   = "ap-northeast-2c",
    tags = {
      Name = "cloud-public-subnet-b2"
    }
  }
}

private_subnets_b = {
  "subnet_b1" = {
    cidr = "10.20.100.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "cloud-private-subnet-b1"
    }
  },
  "subnet_b2" = {
    cidr = "10.20.101.0/24",
    az   = "ap-northeast-2c",
    tags = {
      Name = "cloud-private-subnet-b2"
    }
  }
}
